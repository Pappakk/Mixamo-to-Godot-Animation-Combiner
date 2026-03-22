# Mixamo → Godot GLB Pipeline (v6)

A local web UI that converts a Mixamo character + multiple animations into a single, Godot‑ready `.glb` file — with textures applied — using Blender in the background.

---

## What this tool does

This app automates a workflow that is otherwise tedious and error‑prone:

1. Import a **Mixamo character (FBX, with skin)**
2. Import **multiple Mixamo animations (FBX, without skin)**
3. Reuse the same rig for all animations
4. Apply a **texture** to the character material (if provided)
5. Export everything as a **single `.glb`** file
6. Result is ready to import directly into **Godot** (animations included)

No manual Blender steps required.

---

## Features

* File pickers for:

  * Blender executable
  * Character FBX
  * Texture image (optional)
  * Multiple animation FBX files
  * Output folder + filename
* Runs Blender **headless** (`--background --factory-startup`)
* Applies texture to material before export
* Combines animations into one GLB
* Returns the final `.glb` for download

---

## Requirements

* **Windows** (current version uses Windows dialogs)
* **Blender** (4.x recommended)
* **Node.js**

---

## How to use

1. Start the app (`start-ui.bat` or `npm start`)
2. Open the UI in your browser
3. Fill in the fields:

   * Blender path (`blender.exe`)
   * Character FBX (with skin)
   * Texture (optional)
   * Animation FBXs (without skin)
   * Output folder + file name
4. Click **Run Pipeline**
5. Download your `.glb`

---

## Important notes

* All animations **must come from the same Mixamo rig** as the character
* Animations must be downloaded **Without Skin**
* The character must be downloaded **With Skin**
* If texture is missing, the model will export untextured

---

## Credits

This project builds on the work of:

* **nilooy / character-animation-combiner**
  [https://github.com/nilooy/character-animation-combiner](https://github.com/nilooy/character-animation-combiner)
  Original idea of combining Mixamo animations into a single rig.

* **m-danya / godot-mixamo-glb-generator**
  [https://github.com/m-danya/godot-mixamo-glb-generator](https://github.com/m-danya/godot-mixamo-glb-generator)
  Provided the Blender-based workaround pipeline used here.

---

## Why this exists

The original tools are either:

* no longer maintained, or
* require manual Blender steps

This project wraps the working approach into a **simple local UI**, so you can focus on building your game instead of fighting export pipelines.

---

## License

MIT (or same as your repo — update this section accordingly)

---

Now go make games instead of debugging FBX files for 3 hours.
