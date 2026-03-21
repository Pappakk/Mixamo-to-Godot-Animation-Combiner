const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const crypto = require('crypto');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3210;
const ROOT = __dirname;
const CACHE_DIR = path.join(ROOT, 'tools_cache');
const JOBS_DIR = path.join(ROOT, 'jobs');
const UPLOADS_DIR = path.join(ROOT, 'uploads');
const BLENDER_WRAPPER_PATH = path.join(CACHE_DIR, 'mixamo_glb_v6.py');

ensureDir(CACHE_DIR);
ensureDir(JOBS_DIR);
ensureDir(UPLOADS_DIR);

app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(ROOT, 'public')));

function existsFile(p) {
  try {
    return fs.existsSync(p) && fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function existsDir(p) {
  try {
    return fs.existsSync(p) && fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function isWindows() {
  return process.platform === 'win32';
}

function detectBlender() {
  const envPath = process.env.BLENDER_PATH;
  const candidates = [
    envPath,
    'C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 5.0\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 4.9\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 4.8\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 4.7\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 4.6\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 4.5\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 4.4\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 4.3\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 4.1\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 4.0\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 3.6\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender\\blender.exe',
    '/usr/bin/blender',
    '/usr/local/bin/blender',
    '/snap/bin/blender',
    '/Applications/Blender.app/Contents/MacOS/Blender'
  ].filter(Boolean);

  for (const c of candidates) {
    if (existsFile(c)) return c;
  }

  try {
    const cmd = isWindows() ? 'where' : 'which';
    const out = execFileSync(cmd, ['blender'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();

    if (out) return out.split(/\r?\n/)[0].trim();
  } catch {}

  return '';
}

function escapePowerShell(value) {
  return String(value || '').replace(/'/g, "''");
}

function runWindowsDialog(kind, options = {}) {
  if (!isWindows()) {
    throw new Error('Windows dialogs are only available on Windows.');
  }

  const title = escapePowerShell(options.title || 'Choose');
  const filter = escapePowerShell(options.filter || 'All files (*.*)|*.*');
  const initialDirectory =
    options.initialDirectory && existsDir(options.initialDirectory)
      ? `$dialog.InitialDirectory = '${escapePowerShell(options.initialDirectory)}'`
      : '';

  let script = '';

  if (kind === 'file' || kind === 'files') {
    script = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = '${title}'
$dialog.Filter = '${filter}'
$dialog.Multiselect = ${kind === 'files' ? '$true' : '$false'}
${initialDirectory}
$result = $dialog.ShowDialog()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
  if (${kind === 'files' ? '$true' : '$false'}) { $dialog.FileNames | ForEach-Object { Write-Output $_ } }
  else { Write-Output $dialog.FileName }
}`.trim();
  } else if (kind === 'folder') {
    script = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = '${title}'
$result = $dialog.ShowDialog()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.SelectedPath }
`.trim();
  } else {
    throw new Error('Unknown dialog type.');
  }

  const result = execFileSync('powershell.exe', ['-NoProfile', '-STA', '-Command', script], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();

  if (!result) return [];
  return result.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

function sanitizeFileName(name, fallback = 'output.glb') {
  const base =
    String(name || fallback)
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      .trim() || fallback;

  return base.toLowerCase().endsWith('.glb') ? base : `${base}.glb`;
}

function createJobDir() {
  const jobId = crypto.randomUUID();
  const jobDir = path.join(JOBS_DIR, jobId);
  ensureDir(jobDir);
  return { jobId, jobDir };
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!req.jobDir) {
      const { jobId, jobDir } = createJobDir();
      req.jobId = jobId;
      req.jobDir = jobDir;
      req.uploadDir = path.join(jobDir, 'inputs');
      req.outputDir = path.join(jobDir, 'output');
      ensureDir(req.uploadDir);
      ensureDir(req.outputDir);
    }
    cb(null, req.uploadDir);
  },
  filename: (req, file, cb) => {
    const safe = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  }
});

const upload = multer({ storage });

function buildUploadPayload(req) {
  const files = req.files || {};
  const one = (name) => (files[name] && files[name][0] ? files[name][0].path : '');
  const many = (name) => (files[name] || []).map((f) => f.path);

  return {
    blenderPath: req.body.blenderPath || detectBlender(),
    modelPath: one('modelFile'),
    texturePath: one('textureFile'),
    animationPaths: many('animationFiles'),
    outputDir: req.outputDir,
    outputFileName: sanitizeFileName(req.body.outputFileName || 'character_bundle.glb')
  };
}

function fileExistsOrEmpty(p) {
  return !p || existsFile(p);
}

function validateUploadPayload(payload) {
  const errors = [];

  if (!payload.blenderPath || !existsFile(payload.blenderPath)) {
    errors.push('Blender was not found. Select blender.exe or install Blender somewhere the app can actually find it.');
  }

  if (!payload.modelPath || !existsFile(payload.modelPath)) {
    errors.push('You must choose a character FBX.');
  }

  if (!payload.animationPaths.length || payload.animationPaths.some((p) => !existsFile(p))) {
    errors.push('You must choose at least one valid animation FBX.');
  }

  if (!fileExistsOrEmpty(payload.texturePath)) {
    errors.push('The texture file could not be read.');
  }

  if (!payload.outputFileName.toLowerCase().endsWith('.glb')) {
    errors.push('The output file name must end with .glb.');
  }

  return errors;
}

function writeBlenderWrapper() {
  ensureDir(CACHE_DIR);

  const script = String.raw`
import bpy
import sys
import os
import traceback


def arg_after(flag, default=None):
    argv = sys.argv
    if '--' in argv:
        argv = argv[argv.index('--') + 1:]
    else:
        argv = []
    if flag in argv:
        idx = argv.index(flag)
        if idx + 1 < len(argv):
            return argv[idx + 1]
    return default


def all_after(flag):
    argv = sys.argv
    if '--' in argv:
        argv = argv[argv.index('--') + 1:]
    else:
        argv = []
    if flag not in argv:
        return []
    idx = argv.index(flag) + 1
    values = []
    while idx < len(argv) and not argv[idx].startswith('--'):
        values.append(argv[idx])
        idx += 1
    return values


def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)

    for block in list(bpy.data.meshes):
        if block.users == 0:
            bpy.data.meshes.remove(block)

    for block in list(bpy.data.armatures):
        if block.users == 0:
            bpy.data.armatures.remove(block)

    for block in list(bpy.data.materials):
        if block.users == 0:
            bpy.data.materials.remove(block)

    for block in list(bpy.data.images):
        if block.users == 0:
            bpy.data.images.remove(block)


def import_fbx(filepath):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=filepath, automatic_bone_orientation=True)
    after = set(bpy.data.objects)
    new_objs = list(after - before)
    return new_objs


def find_base_armature(objects):
    for obj in objects:
        if obj.type == 'ARMATURE':
            return obj
    for obj in bpy.data.objects:
        if obj.type == 'ARMATURE':
            return obj
    return None


def find_skinned_meshes(objects, armature):
    meshes = [o for o in objects if o.type == 'MESH']
    if meshes:
        return meshes

    result = []
    for obj in bpy.data.objects:
        if obj.type == 'MESH':
            for mod in obj.modifiers:
                if mod.type == 'ARMATURE' and mod.object == armature:
                    result.append(obj)
                    break
    return result


def set_active_action_name(action, wanted_name):
    if action is None:
        return None
    clean = os.path.splitext(os.path.basename(wanted_name))[0]
    action.name = clean
    return action


def append_animation_to_base(base_armature, anim_fbx):
    imported = import_fbx(anim_fbx)
    imported_armature = next((o for o in imported if o.type == 'ARMATURE'), None)
    imported_meshes = [o for o in imported if o.type == 'MESH']
    action = None

    if imported_armature and imported_armature.animation_data and imported_armature.animation_data.action:
        action = imported_armature.animation_data.action
    else:
        for act in bpy.data.actions:
            if os.path.splitext(os.path.basename(anim_fbx))[0].lower() in act.name.lower():
                action = act
                break

    if action is None:
        raise RuntimeError(f'No action was found in animation file: {anim_fbx}')

    set_active_action_name(action, anim_fbx)

    if base_armature.animation_data is None:
        base_armature.animation_data_create()

    base_armature.animation_data.action = action

    bpy.ops.object.select_all(action='DESELECT')
    for obj in imported_meshes:
        obj.select_set(True)
    if imported_armature:
        imported_armature.select_set(True)
    bpy.ops.object.delete(use_global=False)


def load_image(image_path):
    try:
        return bpy.data.images.load(image_path, check_existing=True)
    except Exception as exc:
        raise RuntimeError(f'Could not load texture image: {image_path} | {exc}')


def ensure_material_with_texture(obj, image):
    mat = obj.active_material
    if mat is None:
        mat = bpy.data.materials.new(name=f'{obj.name}_Mat')
        if obj.data.materials:
            obj.data.materials[0] = mat
        else:
            obj.data.materials.append(mat)

    mat.use_nodes = True
    nt = mat.node_tree
    nodes = nt.nodes
    links = nt.links

    for node in list(nodes):
        if node.type not in {'OUTPUT_MATERIAL', 'BSDF_PRINCIPLED'}:
            nodes.remove(node)

    output = next((n for n in nodes if n.type == 'OUTPUT_MATERIAL'), None)
    if output is None:
        output = nodes.new('ShaderNodeOutputMaterial')
        output.location = (300, 0)

    bsdf = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is None:
        bsdf = nodes.new('ShaderNodeBsdfPrincipled')
        bsdf.location = (0, 0)

    image_node = nodes.new('ShaderNodeTexImage')
    image_node.image = image
    image_node.location = (-350, 0)

    while bsdf.inputs['Base Color'].links:
        links.remove(bsdf.inputs['Base Color'].links[0])

    if not bsdf.outputs['BSDF'].links:
        links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])

    links.new(image_node.outputs['Color'], bsdf.inputs['Base Color'])


def apply_texture(meshes, texture_path):
    if not texture_path:
        return 'No external texture selected.'

    image = load_image(texture_path)
    for obj in meshes:
        ensure_material_with_texture(obj, image)

    return f'Texture applied to {len(meshes)} mesh object(s).'


def export_glb(output_path):
    kwargs = dict(
        filepath=output_path,
        export_format='GLB',
        export_yup=True,
        export_apply=False,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_materials='EXPORT',
        export_cameras=False,
        export_extras=False,
        export_skins=True,
        export_animations=True,
        export_animation_mode='ACTIONS',
        export_nla_strips=False,
        export_optimize_animation_size=False,
        export_morph=False,
        export_image_format='AUTO'
    )
    bpy.ops.export_scene.gltf(**kwargs)


def main():
    model_path = arg_after('--model')
    output_path = arg_after('--output')
    texture_path = arg_after('--texture', '')
    animation_paths = all_after('--animations')

    if not model_path or not output_path or not animation_paths:
        raise RuntimeError('Missing --model, --animations, or --output.')

    clear_scene()
    base_imported = import_fbx(model_path)
    base_armature = find_base_armature(base_imported)

    if base_armature is None:
        raise RuntimeError('No armature was found in the model file.')

    base_meshes = find_skinned_meshes(base_imported, base_armature)
    if not base_meshes:
        raise RuntimeError('No mesh was found in the model file.')

    if base_armature.animation_data is None:
        base_armature.animation_data_create()

    imported_action_names = []
    for anim in animation_paths:
        append_animation_to_base(base_armature, anim)
        imported_action_names.append(os.path.splitext(os.path.basename(anim))[0])

    texture_note = apply_texture(base_meshes, texture_path)
    export_glb(output_path)

    print('DONE')
    print('Base armature:', base_armature.name)
    print('Meshes:', ', '.join([m.name for m in base_meshes]))
    print('Actions:', ', '.join(imported_action_names))
    print(texture_note)
    print('Output:', output_path)


try:
    main()
except Exception as exc:
    print('ERROR:', exc)
    traceback.print_exc()
    raise
`;

  fs.writeFileSync(BLENDER_WRAPPER_PATH, script, 'utf8');
  return BLENDER_WRAPPER_PATH;
}

function buildCommandPreview(blenderPath, scriptPath, payload) {
  const q = (v) => `"${String(v).replace(/"/g, '\\"')}"`;
  const outPath = path.join(payload.outputDir, payload.outputFileName);

  const parts = [
    q(blenderPath),
    '--background',
    '--factory-startup',
    '--python',
    q(scriptPath),
    '--',
    '--model',
    q(payload.modelPath),
    '--animations',
    ...payload.animationPaths.map(q)
  ];

  if (payload.texturePath) parts.push('--texture', q(payload.texturePath));
  parts.push('--output', q(outPath));

  return parts.join(' ');
}

app.get('/api/status', (req, res) => {
  res.json({
    ok: true,
    blenderPath: detectBlender(),
    wrapperCached: existsFile(BLENDER_WRAPPER_PATH),
    note: 'This build uses real file uploads for model, texture, and animations. Less magical nonsense, more actual reliability.'
  });
});

app.post(
  '/api/run-upload',
  upload.fields([
    { name: 'modelFile', maxCount: 1 },
    { name: 'textureFile', maxCount: 1 },
    { name: 'animationFiles', maxCount: 200 }
  ]),
  (req, res) => {
    const payload = buildUploadPayload(req);
    const errors = validateUploadPayload(payload);

    if (errors.length) {
      return res.status(400).json({ ok: false, errors });
    }

    try {
      const scriptPath = writeBlenderWrapper();
      const outputPath = path.join(payload.outputDir, payload.outputFileName);

      const args = [
        '--background',
        '--factory-startup',
        '--python',
        scriptPath,
        '--',
        '--model',
        payload.modelPath,
        '--animations',
        ...payload.animationPaths
      ];

      if (payload.texturePath) args.push('--texture', payload.texturePath);
      args.push('--output', outputPath);

      const child = spawn(payload.blenderPath, args, {
        cwd: ROOT,
        windowsHide: true
      });

      let stdout = '';
      let stderr = '';
      let finished = false;

      child.stdout.on('data', (d) => {
        stdout += d.toString();
      });

      child.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      child.on('error', (error) => {
        if (finished) return;
        finished = true;

        res.status(500).json({
          ok: false,
          error: `Could not start Blender. ${error.message}`,
          commandPreview: buildCommandPreview(payload.blenderPath, scriptPath, payload),
          stdout,
          stderr
        });
      });

      child.on('close', (code) => {
        if (finished) return;
        finished = true;

        const commandPreview = buildCommandPreview(payload.blenderPath, scriptPath, payload);

        if (code !== 0 || !existsFile(outputPath)) {
          return res.status(500).json({
            ok: false,
            error: `Blender exited with code ${code}.`,
            commandPreview,
            stdout,
            stderr
          });
        }

        res.json({
          ok: true,
          jobId: req.jobId,
          outputFileName: payload.outputFileName,
          downloadUrl: `/download/${req.jobId}/${encodeURIComponent(payload.outputFileName)}`,
          commandPreview,
          stdout,
          stderr,
          note: 'GLB created successfully. Download it in the browser like a civilized person.'
        });
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  }
);

app.get('/download/:jobId/:fileName', (req, res) => {
  const jobDir = path.join(JOBS_DIR, req.params.jobId, 'output');
  const fileName = path.basename(req.params.fileName);
  const filePath = path.join(jobDir, fileName);

  if (!existsFile(filePath)) {
    return res.status(404).send('File not found.');
  }

  res.download(filePath, fileName);
});

app.listen(PORT, () => {
  console.log(`Mixamo UI v6 is running at http://localhost:${PORT}`);
});