import { WmClient, WmEventType } from "glazewm";
import SysTrayImport from "systray";

const SysTray =
  (SysTrayImport as any).default ??
  (SysTrayImport as any);

// ---------------------------------------------------------------------------
// Pure-JS ICO generator — draws workspace number as pixel art, zero native deps
// ---------------------------------------------------------------------------

// 3×7 pixel font for digits
const FONT: Record<string, number[][]> = {
  "0": [[1,1,1],[1,0,1],[1,0,1],[1,0,1],[1,0,1],[1,0,1],[1,1,1]],
  "1": [[0,1,0],[1,1,0],[0,1,0],[0,1,0],[0,1,0],[0,1,0],[1,1,1]],
  "2": [[1,1,1],[0,0,1],[0,0,1],[1,1,1],[1,0,0],[1,0,0],[1,1,1]],
  "3": [[1,1,1],[0,0,1],[0,0,1],[1,1,1],[0,0,1],[0,0,1],[1,1,1]],
  "4": [[1,0,1],[1,0,1],[1,0,1],[1,1,1],[0,0,1],[0,0,1],[0,0,1]],
  "5": [[1,1,1],[1,0,0],[1,0,0],[1,1,1],[0,0,1],[0,0,1],[1,1,1]],
  "6": [[1,1,1],[1,0,0],[1,0,0],[1,1,1],[1,0,1],[1,0,1],[1,1,1]],
  "7": [[1,1,1],[0,0,1],[0,0,1],[0,0,1],[0,0,1],[0,0,1],[0,0,1]],
  "8": [[1,1,1],[1,0,1],[1,0,1],[1,1,1],[1,0,1],[1,0,1],[1,1,1]],
  "9": [[1,1,1],[1,0,1],[1,0,1],[1,1,1],[0,0,1],[0,0,1],[1,1,1]],
};

function drawText(
  rgba: Uint8Array,
  size: number,
  text: string,
  color: [number, number, number, number]
) {
  const SCALE = 3, CHAR_W = 3, CHAR_H = 7, GAP = 2;
  const chars = text.split("").filter((c) => FONT[c]);
  const totalW = chars.length * CHAR_W * SCALE + (chars.length - 1) * GAP;
  let startX = Math.floor((size - totalW) / 2);
  const startY = Math.floor((size - CHAR_H * SCALE) / 2);

  for (const ch of chars) {
    for (let row = 0; row < CHAR_H; row++) {
      for (let col = 0; col < CHAR_W; col++) {
        if (FONT[ch][row][col]) {
          for (let sy = 0; sy < SCALE; sy++) {
            for (let sx = 0; sx < SCALE; sx++) {
              const px = startX + col * SCALE + sx;
              const py = startY + row * SCALE + sy;
              if (px >= 0 && px < size && py >= 0 && py < size) {
                const i = (py * size + px) * 4;
                rgba[i] = color[0]; rgba[i+1] = color[1];
                rgba[i+2] = color[2]; rgba[i+3] = color[3];
              }
            }
          }
        }
      }
    }
    startX += CHAR_W * SCALE + GAP;
  }
}

function makeIcoBase64(label: string, active: boolean): string {
  const SIZE = 32;
  const rgba = new Uint8Array(SIZE * SIZE * 4);

  // Background
  const bg: [number,number,number,number] = active
    ? [0x00, 0x78, 0xd4, 0xff]  // Windows blue
    : [0x33, 0x33, 0x33, 0xff]; // dark grey

  for (let i = 0; i < SIZE * SIZE; i++) {
    rgba[i*4]=bg[0]; rgba[i*4+1]=bg[1]; rgba[i*4+2]=bg[2]; rgba[i*4+3]=bg[3];
  }

  // Rounded corners (radius 5)
  const R = 5;
  for (let y = 0; y < R; y++) {
    for (let x = 0; x < R; x++) {
      if ((R-x-0.5)**2 + (R-y-0.5)**2 > R*R) {
        for (const [px,py] of [[x,y],[SIZE-1-x,y],[x,SIZE-1-y],[SIZE-1-x,SIZE-1-y]] as [number,number][]) {
          rgba[(py*SIZE+px)*4+3] = 0;
        }
      }
    }
  }

  drawText(rgba, SIZE, label, [0xff, 0xff, 0xff, 0xff]);

  // Pack as ICO (32x32, 32bpp)
  const xorSize = SIZE * SIZE * 4;
  const andSize = Math.ceil(SIZE / 8) * SIZE;
  const dibSize = 40 + xorSize + andSize;
  const buf = Buffer.alloc(6 + 16 + dibSize);
  let o = 0;

  // ICO header
  buf.writeUInt16LE(0, o); o+=2;
  buf.writeUInt16LE(1, o); o+=2;
  buf.writeUInt16LE(1, o); o+=2;
  // Directory
  buf.writeUInt8(SIZE, o); o+=1;
  buf.writeUInt8(SIZE, o); o+=1;
  buf.writeUInt8(0, o);    o+=1;
  buf.writeUInt8(0, o);    o+=1;
  buf.writeUInt16LE(1, o); o+=2;
  buf.writeUInt16LE(32, o); o+=2;
  buf.writeUInt32LE(dibSize, o); o+=4;
  buf.writeUInt32LE(22, o); o+=4;
  // BITMAPINFOHEADER
  buf.writeUInt32LE(40, o);      o+=4;
  buf.writeInt32LE(SIZE, o);     o+=4;
  buf.writeInt32LE(SIZE*2, o);   o+=4;
  buf.writeUInt16LE(1, o);       o+=2;
  buf.writeUInt16LE(32, o);      o+=2;
  buf.writeUInt32LE(0, o);       o+=4;
  buf.writeUInt32LE(xorSize, o); o+=4;
  buf.writeInt32LE(0, o);        o+=4;
  buf.writeInt32LE(0, o);        o+=4;
  buf.writeUInt32LE(0, o);       o+=4;
  buf.writeUInt32LE(0, o);       o+=4;
  // XOR bitmap: BGRA, bottom-up
  for (let row = SIZE-1; row >= 0; row--) {
    for (let col = 0; col < SIZE; col++) {
      const s = (row*SIZE+col)*4;
      buf[o++]=rgba[s+2]; buf[o++]=rgba[s+1]; buf[o++]=rgba[s]; buf[o++]=rgba[s+3];
    }
  }
  // AND mask (all 0)
  for (let i = 0; i < andSize; i++) buf[o++] = 0;

  return buf.toString("base64");
}

// Cache icons so we don't regenerate every tick
const iconCache = new Map<string, string>();
function getIcon(label: string, active: boolean): string {
  const key = `${label}-${active}`;
  if (!iconCache.has(key)) iconCache.set(key, makeIcoBase64(label, active));
  return iconCache.get(key)!;
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------

type Workspace = { name: string; hasFocus: boolean };

const QUIT_ITEM = {
  title: "Quit",
  tooltip: "Exit GlazeWM tray",
  checked: false,
  enabled: true,
};

let tray: SysTray | null = null;
let lastActive = "";

function updateTray(workspaces: Workspace[]) {
  const active = workspaces.find((w) => w.hasFocus);
  const label = active?.name ?? "?";
  if (label === lastActive && tray) return;
  lastActive = label;

  const icon = getIcon(label, true);
  const tooltip = workspaces.map((w) => w.hasFocus ? `[${w.name}]` : w.name).join("  ");

  if (!tray) {
    tray = new SysTray({
      menu: {
        icon,
        title: "",
        tooltip,
        items: [QUIT_ITEM],
      },
      debug: false,
      copyDir: true,
    });

    tray.onClick((action) => {
      if (action.seq_id === 0) {  // Quit
        tray?.kill();
        process.exit(0);
      }
    });

    console.log("Tray started:", tooltip);
  } else {
    tray.sendAction({
      type: "update-menu",
      menu: {
        icon,
        title: "",
        tooltip,
        items: [QUIT_ITEM],
      },
    });
  }
}

async function main() {
  const client = new WmClient();

  client.onConnect(async () => {
    console.log("Connected to GlazeWM");
    const { workspaces } = await client.queryWorkspaces();
    updateTray(workspaces);

    for (const event of [
      WmEventType.FOCUS_CHANGED,
      WmEventType.WORKSPACE_ACTIVATED,
      WmEventType.WORKSPACE_DEACTIVATED,
    ]) {
      await client.subscribe(event, async () => {
        const { workspaces } = await client.queryWorkspaces();
        updateTray(workspaces);
      });
    }
  });

  await new Promise(() => {});
}

main();
