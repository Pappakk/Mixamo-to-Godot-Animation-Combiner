# Mixamo UI v4

Lokal webUI för att:
- välja Blender, modell-FBX, textur, animationer och output-mapp via riktiga Windows-dialoger
- köra Blender i bakgrunden
- exportera en texturerad GLB till Godot

## Start

### Windows
Dubbelklicka på `start-ui.bat`

### Linux/macOS
Kör `./start-ui.sh`

## Krav
- Node.js
- Blender

## Vad som är nytt i v4
Den här versionen applicerar den valda texturen på materialet i Blender före export. Tidigare versioner flyttade runt texturfilen utan att koppla den till materialet, vilket var ungefär lika användbart som att måla en bil på insidan av garaget.
