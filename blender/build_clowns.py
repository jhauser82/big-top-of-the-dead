"""
build_clowns.py — turn a CC0 base humanoid into a cast of clowns.

Generates the clown silhouette (nose, wig, ruff, hat, pompoms, big shoes),
skins each piece to a single bone of the existing rig, applies a palette, and
exports one GLB per variant. The rig and its animations are untouched, so
every clip in the Universal Animation Library still plays.

Usage
-----
    blender -b -P build_clowns.py

or paste into Blender's Scripting tab and press Run. Tested on Blender 4.x.

Edit CONFIG below. The only path you must set is BASE_MODEL.
"""

import bpy
import bmesh
import math
from mathutils import Matrix, Vector

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────────────────

BASE_MODEL = "//assets/source/Universal_Base_Character.glb"
OUT_DIR    = "//../public/assets/characters/"

# Offsets are in metres, in each bone's local rest space, and get scaled by
# RIG_SCALE (derived from the armature height) so a different base still fits.
# Tweak these if parts float or intersect — that is the main thing you'll do.
FIT = {
    "nose_offset":   (0.00,  0.10,  0.135),
    "wig_offset":    (0.115, 0.11, -0.01),
    "wig_back":      (0.00,  0.15, -0.10),
    "hat_offset":    (0.01,  0.26, -0.01),
    "hat_tilt":      math.radians(9),
    "ruff_offset":   (0.00,  0.02,  0.00),
    "shoe_offset":   (0.00, -0.02,  0.07),
    "pompom_rows":   4,
}

VARIANTS = [
    # name,             suit,       skin,       hair,       shoe,       nose
    ("clown-player",   0x2F7FC4, 0xF4EFE4, 0xE8B21C, 0xC8102E, 0xC8102E, False),
    ("clown-zombie-a", 0x5C2A52, 0x7E9C5C, 0x8F3527, 0x2F231A, 0x6E2A1C, True),
    ("clown-zombie-b", 0x2A4A3A, 0x84A069, 0x8F5F26, 0x261E16, 0x7D2F20, True),
    ("clown-zombie-c", 0x4E401D, 0x789260, 0x603963, 0x2D221E, 0x843025, True),
]

# Substrings searched case-insensitively against bone names. First hit wins.
BONE_ALIASES = {
    "head":  ["head"],
    "chest": ["upperchest", "chest", "spine2", "spine_02", "spine.003"],
    "footL": ["leftfoot", "foot.l", "foot_l", "l_foot"],
    "footR": ["rightfoot", "foot.r", "foot_r", "r_foot"],
    "neck":  ["neck"],
}

# Material name substrings on the base mesh, so the body recolours too.
BODY_MATERIAL_HINTS = {
    "skin": ["skin", "body", "head", "face"],
    "suit": ["cloth", "shirt", "outfit", "torso", "pants", "suit"],
}

TATTER_STRENGTH = 0.012   # random vertex jitter on zombie variants


# ─────────────────────────────────────────────────────────────────────────────
# helpers
# ─────────────────────────────────────────────────────────────────────────────

def rgb(hex_int):
    return ((hex_int >> 16 & 255) / 255.0,
            (hex_int >> 8 & 255) / 255.0,
            (hex_int & 255) / 255.0,
            1.0)


def srgb_to_linear(c):
    out = []
    for v in c[:3]:
        out.append(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4)
    out.append(1.0)
    return out


def wipe_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.armatures,
                  bpy.data.objects, bpy.data.actions):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def find_armature():
    for obj in bpy.data.objects:
        if obj.type == "ARMATURE":
            return obj
    raise RuntimeError("No armature in the imported file — is BASE_MODEL a rigged glTF?")


def resolve_bones(arm):
    """Map our logical names onto whatever this rig actually calls its bones."""
    found = {}
    names = [b.name for b in arm.data.bones]
    lower = {n.lower(): n for n in names}
    for logical, candidates in BONE_ALIASES.items():
        for cand in candidates:
            hit = next((orig for low, orig in lower.items() if cand in low), None)
            if hit:
                found[logical] = hit
                break
    missing = [k for k in ("head", "chest", "footL", "footR") if k not in found]
    if missing:
        raise RuntimeError(
            "Could not resolve bones: %s\nRig has: %s\n"
            "Add the right substrings to BONE_ALIASES." % (missing, sorted(names))
        )
    return found


def rig_scale(arm):
    """Roughly 1.0 for a 1.8m humanoid, so FIT offsets transfer between rigs."""
    height = arm.dimensions.z or 1.8
    return height / 1.8


def make_material(name, color_hex, rough=0.8, emit=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = srgb_to_linear(rgb(color_hex))
    bsdf.inputs["Roughness"].default_value = rough
    if emit is not None:
        bsdf.inputs["Emission Color"].default_value = srgb_to_linear(rgb(emit))
        bsdf.inputs["Emission Strength"].default_value = 0.6
    return mat


def bone_matrix(arm, bone_name):
    """World matrix of a bone's rest head, with the bone's own orientation."""
    bone = arm.data.bones[bone_name]
    return arm.matrix_world @ bone.matrix_local


def new_mesh_obj(name, mat):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(mat)
    bpy.context.collection.objects.link(obj)
    return obj


def bm_to_obj(bm, obj):
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.use_auto_smooth = False
    for poly in obj.data.polygons:
        poly.use_smooth = True


def skin_to_bone(obj, arm, bone_name):
    """Bind every vertex to one bone at weight 1. Exports as a clean skinned
    mesh, so the accessory follows animation with no extra rig work."""
    group = obj.vertex_groups.new(name=bone_name)
    group.add([v.index for v in obj.data.vertices], 1.0, "REPLACE")
    obj.parent = arm
    obj.matrix_parent_inverse = arm.matrix_world.inverted()
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = arm


def place(obj, arm, bone_name, offset, scale, rot=None):
    m = bone_matrix(arm, bone_name)
    local = Matrix.Translation(Vector(offset) * scale)
    if rot is not None:
        local = local @ rot
    obj.matrix_world = m @ local @ Matrix.Diagonal((scale, scale, scale, 1.0))


# ─────────────────────────────────────────────────────────────────────────────
# accessory builders
# ─────────────────────────────────────────────────────────────────────────────

def build_sphere(name, mat, radius, segs=16, rings=10, squash=1.0):
    obj = new_mesh_obj(name, mat)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=radius)
    if squash != 1.0:
        bmesh.ops.scale(bm, vec=Vector((1, squash, 1)), verts=bm.verts)
    bm_to_obj(bm, obj)
    return obj


def build_cone(name, mat, radius, depth, segs=16):
    obj = new_mesh_obj(name, mat)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs,
                          radius1=radius, radius2=0.012, depth=depth)
    bm_to_obj(bm, obj)
    return obj


def build_torus(name, mat, major, minor, segs=20, rings=10):
    obj = new_mesh_obj(name, mat)
    bm = bmesh.new()
    # bmesh has no torus primitive; sweep a ring of verts
    for i in range(segs):
        a = i / segs * math.tau
        centre = Vector((math.cos(a) * major, math.sin(a) * major, 0))
        tangent = Vector((-math.sin(a), math.cos(a), 0))
        normal = Vector((math.cos(a), math.sin(a), 0))
        for j in range(rings):
            b = j / rings * math.tau
            bm.verts.new(centre + normal * math.cos(b) * minor
                         + Vector((0, 0, 1)) * math.sin(b) * minor)
    bm.verts.ensure_lookup_table()
    for i in range(segs):
        for j in range(rings):
            a0 = i * rings + j
            a1 = i * rings + (j + 1) % rings
            b0 = ((i + 1) % segs) * rings + j
            b1 = ((i + 1) % segs) * rings + (j + 1) % rings
            bm.faces.new((bm.verts[a0], bm.verts[a1], bm.verts[b1], bm.verts[b0]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm_to_obj(bm, obj)
    return obj


def build_shoe(name, mat, length, width, height):
    obj = new_mesh_obj(name, mat)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((width, length, height)), verts=bm.verts)
    # round the toe: pull the front-top verts down and forward
    for v in bm.verts:
        if v.co.y > 0:
            v.co.y *= 1.35
            v.co.z -= 0.14 * height
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=1, use_grid_fill=True)
    for v in bm.verts:
        v.co.z += height * 0.5
    bm_to_obj(bm, obj)
    bevel = obj.modifiers.new("Bevel", "BEVEL")
    bevel.width = min(width, height) * 0.28
    bevel.segments = 2
    return obj


def tatter(obj, strength):
    """Rough the silhouette up so the zombies don't look factory-fresh."""
    import random
    rnd = random.Random(hash(obj.name) & 0xFFFF)
    for v in obj.data.vertices:
        v.co.x += rnd.uniform(-strength, strength)
        v.co.y += rnd.uniform(-strength, strength)
        v.co.z += rnd.uniform(-strength, strength)


# ─────────────────────────────────────────────────────────────────────────────
# variant assembly
# ─────────────────────────────────────────────────────────────────────────────

def recolour_body(suit_hex, skin_hex):
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        low = mat.name.lower()
        target = None
        if any(h in low for h in BODY_MATERIAL_HINTS["skin"]):
            target = skin_hex
        elif any(h in low for h in BODY_MATERIAL_HINTS["suit"]):
            target = suit_hex
        if target is None:
            continue
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = srgb_to_linear(rgb(target))


def build_variant(arm, bones, scale, suit, skin, hair, shoe, nose, undead):
    mats = {
        "suit":  make_material("ClownSuit", suit, 0.78),
        "hair":  make_material("ClownHair", hair, 0.95),
        "shoe":  make_material("ClownShoe", shoe, 0.42),
        "nose":  make_material("ClownNose", nose, 0.30, emit=nose),
        "cream": make_material("ClownRuff", 0xE8DDC6, 0.90),
    }
    made = []

    # red nose
    n = build_sphere("Nose", mats["nose"], 0.038)
    place(n, arm, bones["head"], FIT["nose_offset"], scale)
    made.append((n, bones["head"]))

    # wig: two side puffs and one at the back
    for i, sign in enumerate((-1, 1)):
        off = list(FIT["wig_offset"])
        off[0] *= sign
        w = build_sphere("Wig_%d" % i, mats["hair"], 0.062, squash=1.15)
        place(w, arm, bones["head"], off, scale)
        made.append((w, bones["head"]))
    wb = build_sphere("Wig_back", mats["hair"], 0.058, squash=0.9)
    place(wb, arm, bones["head"], FIT["wig_back"], scale)
    made.append((wb, bones["head"]))

    # conical hat with a pompom on top
    hat = build_cone("Hat", mats["suit"], 0.085, 0.19)
    place(hat, arm, bones["head"], FIT["hat_offset"], scale,
          rot=Matrix.Rotation(FIT["hat_tilt"], 4, "Z"))
    made.append((hat, bones["head"]))
    tip = list(FIT["hat_offset"])
    tip[1] += 0.185
    pom = build_sphere("Hat_pompom", mats["hair"], 0.03)
    place(pom, arm, bones["head"], tip, scale)
    made.append((pom, bones["head"]))

    # ruff collar
    neck_bone = bones.get("neck", bones["chest"])
    ruff = build_torus("Ruff", mats["cream"], 0.075, 0.028)
    place(ruff, arm, neck_bone, FIT["ruff_offset"], scale)
    made.append((ruff, neck_bone))

    # pompom buttons down the chest
    for i in range(FIT["pompom_rows"]):
        b = build_sphere("Button_%d" % i, mats["hair"], 0.024)
        place(b, arm, bones["chest"], (0.0, -0.02 + i * 0.055, 0.095), scale)
        made.append((b, bones["chest"]))

    # oversized shoes
    for side, bone_key in (("L", "footL"), ("R", "footR")):
        s = build_shoe("Shoe_%s" % side, mats["shoe"], 0.13, 0.075, 0.055)
        place(s, arm, bones[bone_key], FIT["shoe_offset"], scale)
        made.append((s, bones[bone_key]))

    for obj, bone in made:
        if undead:
            tatter(obj, TATTER_STRENGTH * scale)
        skin_to_bone(obj, arm, bone)

    recolour_body(suit, skin)
    return [o for o, _ in made]


def export(path):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=bpy.path.abspath(path),
        export_format="GLB",
        export_apply=True,
        export_animations=True,
        export_skins=True,
        export_yup=True,
    )
    print("wrote", path)


def main():
    for name, suit, skin, hair, shoe, nose, undead in VARIANTS:
        wipe_scene()
        bpy.ops.import_scene.gltf(filepath=bpy.path.abspath(BASE_MODEL))
        arm = find_armature()
        bones = resolve_bones(arm)
        scale = rig_scale(arm)
        print("%s — rig scale %.3f, bones %s" % (name, scale, bones))
        build_variant(arm, bones, scale, suit, skin, hair, shoe, nose, undead)
        export(OUT_DIR + name + ".glb")


if __name__ == "__main__":
    main()
