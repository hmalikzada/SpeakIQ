"""
preprocess_head.py
Samples ~80,000 surface points from head_mesh.obj and saves them as
a compact binary file (head_particles.bin) for Three.js to load.

Per-point layout (9 × float32 = 36 bytes):
  [0] x  [1] y  [2] z        — world position (Three.js coords)
  [3] nx [4] ny [5] nz       — interpolated surface normal (outward)
  [6] brightness              — 0..1 (lighting + Z-position based)
  [7] region                  — 0=face 1=back 2=neck
  [8] ny_anim                 — world-y (for mouth/eye anim masks)
"""

import struct, random, math, bisect, sys, time

OBJ_FILE = r"C:\Users\haseebm\Desktop\SpeakIQ\head_mesh.obj"
OUT_FILE = r"C:\Users\haseebm\Desktop\SpeakIQ\head_particles.bin"
N_SAMPLES = 80_000   # total surface particles
random.seed(42)

t0 = time.time()

# ── 1. Parse OBJ ─────────────────────────────────────────────────
print("Parsing OBJ…", flush=True)
verts  = []   # (x, y, z)
vnorms = []   # (nx, ny, nz)
faces  = []   # list of triangles: [(vi0,vni0), (vi1,vni1), (vi2,vni2)]

with open(OBJ_FILE, "r") as f:
    for line in f:
        if line.startswith("v "):
            p = line.split()
            verts.append((float(p[1]), float(p[2]), float(p[3])))
        elif line.startswith("vn "):
            p = line.split()
            vnorms.append((float(p[1]), float(p[2]), float(p[3])))
        elif line.startswith("f "):
            parts = line.split()[1:]
            groups = []
            for part in parts:
                spl = part.split("/")
                vi  = int(spl[0]) - 1
                vni = int(spl[2]) - 1 if len(spl) >= 3 and spl[2] else vi
                groups.append((vi, vni))
            # Fan triangulation (works for tris and quads)
            for i in range(1, len(groups) - 1):
                faces.append((groups[0], groups[i], groups[i + 1]))

print(f"  verts={len(verts):,}  vnorms={len(vnorms):,}  tris={len(faces):,}", flush=True)

# ── 2. Normalize coordinates ─────────────────────────────────────
# OBJ axis: X=left/right, Y=up, Z=depth (face at +Z per analysis)
# Map to Three.js: same axes, but centre the head and scale to 1.2 units tall.
ys = [v[1] for v in verts]
cy = (min(ys) + max(ys)) / 2.0
height = max(ys) - min(ys)
scale  = 1.2 / height

def tv(v):   # transform vertex position
    return (v[0] * scale, (v[1] - cy) * scale, v[2] * scale)

def tn(n):   # transform vertex normal (just scale doesn't change direction)
    return n  # normals stay the same direction (no non-uniform scale)

tverts  = [tv(v) for v in verts]
tvnorms = [tn(n) for n in vnorms]

print(f"  Scale={scale:.4f}, centY={cy:.4f}", flush=True)

# ── 3. Compute triangle areas (for weighted sampling) ────────────
print("Computing face areas…", flush=True)

def cross(ax, ay, az, bx, by, bz):
    return ay*bz-az*by, az*bx-ax*bz, ax*by-ay*bx

areas = []
for (i0,_), (i1,_), (i2,_) in faces:
    v0, v1, v2 = tverts[i0], tverts[i1], tverts[i2]
    ax, ay, az = v1[0]-v0[0], v1[1]-v0[1], v1[2]-v0[2]
    bx, by, bz = v2[0]-v0[0], v2[1]-v0[1], v2[2]-v0[2]
    cx, cy2, cz = cross(ax,ay,az, bx,by,bz)
    areas.append(0.5 * math.sqrt(cx*cx + cy2*cy2 + cz*cz))

total_area = sum(areas)
print(f"  Total surface area: {total_area:.4f} sq-units", flush=True)

# Cumulative distribution for weighted random sampling
cumw = []
s = 0.0
for a in areas:
    s += a
    cumw.append(s)

# ── 4. Lighting setup ────────────────────────────────────────────
# Key light: upper-front-left (matches Blender three-point setup)
def normalize3(x, y, z):
    l = math.sqrt(x*x + y*y + z*z) or 1e-10
    return x/l, y/l, z/l

KLX, KLY, KLZ = normalize3(-0.45, 0.30, 0.85)  # key light dir (toward surface)
FLX, FLY, FLZ = normalize3( 0.30, 0.20, 0.90)  # fill light dir

# ── 5. Sample surface points ──────────────────────────────────────
print(f"Sampling {N_SAMPLES:,} surface points…", flush=True)

out_data = []
for _ in range(N_SAMPLES):
    # Pick face by area weight
    r  = random.random() * total_area
    fi = bisect.bisect_left(cumw, r)
    fi = min(fi, len(faces) - 1)
    (i0, ni0), (i1, ni1), (i2, ni2) = faces[fi]

    v0, v1, v2 = tverts[i0], tverts[i1], tverts[i2]
    n0, n1, n2 = tvnorms[ni0], tvnorms[ni1], tvnorms[ni2]

    # Random barycentric coordinate
    u = random.random()
    v = random.random()
    if u + v > 1.0:
        u, v = 1.0 - u, 1.0 - v
    w = 1.0 - u - v

    # Interpolated position
    px = u*v0[0] + v*v1[0] + w*v2[0]
    py = u*v0[1] + v*v1[1] + w*v2[1]
    pz = u*v0[2] + v*v1[2] + w*v2[2]

    # Interpolated normal (then normalise)
    nx = u*n0[0] + v*n1[0] + w*n2[0]
    ny = u*n0[1] + v*n1[1] + w*n2[1]
    nz = u*n0[2] + v*n1[2] + w*n2[2]
    nl = math.sqrt(nx*nx + ny*ny + nz*nz) or 1e-10
    nx, ny, nz = nx/nl, ny/nl, nz/nl

    # Ensure normal faces outward (dot with position from origin > 0)
    if nx*px + ny*py + nz*pz < 0:
        nx, ny, nz = -nx, -ny, -nz

    # Brightness model: matches Blender render look
    #   Face interior  → ~0.35 (maps to cool blue in color ramp)
    #   Silhouette rim → kept LOW here; shader adds view-dependent rim glow
    #   Back of head   → ~0.0  (invisible)
    #
    # Use Z-depth as PRIMARY driver (face=+0.52 bright, back=-0.52 dark)
    # Small diffuse key from front-left for subtle facial variation.
    z_norm = max(0.0, min(1.0, (pz + 0.52) / 1.04))
    diff_key  = max(0.0, nx*KLX + ny*KLY + nz*KLZ)
    brightness = z_norm * 0.30 + diff_key * 0.08
    brightness = min(0.80, brightness)   # cap so shader rim drives the whites

    # ── Region detection ────────────────────────────────────
    # Coordinates (Three.js, scale=0.6416):
    #   Y: -0.60 (neck bottom) → +0.60 (crown)
    #   Z: -0.52 (back) → +0.52 (nose tip)
    #   X: -0.45 (L ear) → +0.45 (R ear), nose at X≈0

    is_neck = (py < -0.40)
    is_back = (nz < -0.15 and pz < 0.12)   # normal facing -Z and behind centre

    # Eye sockets: above nose (Y>0.08), within ±0.20 X, front-facing (Z>0.34)
    is_eye_R = (0.05 < px < 0.22 and 0.08 < py < 0.32 and pz > 0.34 and not is_back)
    is_eye_L = (-0.22 < px < -0.05 and 0.08 < py < 0.32 and pz > 0.34 and not is_back)

    # Mouth / lips: below nose (Y<-0.04), central X, front-facing
    is_mouth = (abs(px) < 0.18 and -0.28 < py < -0.04 and pz > 0.34 and not is_back)

    if is_neck:
        region = 2.0
    elif is_back:
        region = 1.0
    elif is_eye_R:
        region = 3.0   # eyeL in shader (positive X side)
    elif is_eye_L:
        region = 4.0   # eyeR in shader (negative X side)
    elif is_mouth:
        region = 5.0
    else:
        region = 0.0   # general face / front

    out_data.extend([px, py, pz, nx, ny, nz, brightness, region, py])

# ── 6. Write binary ──────────────────────────────────────────────
with open(OUT_FILE, "wb") as f:
    f.write(struct.pack(f"{len(out_data)}f", *out_data))

size_kb = len(out_data) * 4 / 1024
print(f"Written: {OUT_FILE}")
print(f"  Points: {N_SAMPLES:,}  |  File: {size_kb:.0f} KB  |  Time: {time.time()-t0:.1f}s")
