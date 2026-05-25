import MAIN_MAP_DATA from '../../public/assets/maps/MainMap.json';
import { assetUrl } from '../utils/assets';

type TiledTileset = (typeof MAIN_MAP_DATA)['tilesets'][number];

export type TilesetImageConfig = {
  tiledNames: string[];
  key: string;
  url: string;
  tileWidth?: number;
  tileHeight?: number;
  tileMargin?: number;
  tileSpacing?: number;
};

const TILESET_IMAGE_OVERRIDES: Record<string, string> = {
  haystack: 'assets/plain/haystack.png',
};

const TILESET_NAME_ALIASES: Record<string, string[]> = {
  grass: ['tiles-grass'],
  'Grass 2 layer': ['tiles-grass-2-layer'],
  'pine tree': ['tiles-pine-tree'],
  Plants: ['tiles-plants'],
  shrine: ['tiles-shrine'],
  house1: ['tiles-house1'],
  fence: ['tiles-fence'],
  house2: ['tiles-house2'],
  barrel: ['tiles-barrel'],
  wheat: ['tiles-wheat'],
  corn: ['tiles-corn'],
  haystack: ['tiles-haystack'],
  stone_path: ['tiles-stone-path'],
  direct: ['tiles-direct'],
  handcart: ['tiles-handcart'],
};

function normalizeTilesetKey(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function normalizeTilesetImagePath(imagePath: string) {
  if (imagePath.startsWith('assets/forest/')) {
    return imagePath.replace(/^assets\/forest\//, 'assets/tilesets/forest/');
  }

  return imagePath;
}

function resolveTilesetImagePath(tileset: TiledTileset) {
  const overridePath = TILESET_IMAGE_OVERRIDES[tileset.name];
  if (overridePath) return overridePath;

  if (typeof tileset.image === 'string' && tileset.image.length > 0) {
    return normalizeTilesetImagePath(tileset.image);
  }

  const collectionImagePath = tileset.tiles?.find(
    (tile): tile is { id: number; image: string; imageheight: number; imagewidth: number } =>
      'image' in tile && typeof tile.image === 'string' && tile.image.length > 0,
  )?.image;
  return collectionImagePath ? normalizeTilesetImagePath(collectionImagePath) : null;
}

function resolveTilesetNames(tileset: TiledTileset) {
  if (typeof tileset.image !== 'string' && Array.isArray(tileset.tiles)) {
    const imageNames = tileset.tiles
      .map((tile) => (typeof tile.image === 'string' && tile.image.length > 0 ? tile.image : null))
      .filter((imageName): imageName is string => imageName !== null);

    if (imageNames.length > 0) {
      return imageNames;
    }
  }

  return [tileset.name, ...(TILESET_NAME_ALIASES[tileset.name] ?? [])];
}

export const MAIN_MAP_TILESET_IMAGES = MAIN_MAP_DATA.tilesets
  .map<TilesetImageConfig | null>((tileset) => {
    const imagePath = resolveTilesetImagePath(tileset);

    if (!imagePath) {
      console.warn(`[mapTilesets] Skip tileset "${tileset.name}" because it has no image path.`);
      return null;
    }

    return {
      tiledNames: resolveTilesetNames(tileset),
      key: `mainmap-${normalizeTilesetKey(tileset.name)}`,
      url: assetUrl(imagePath),
      tileWidth: tileset.tilewidth,
      tileHeight: tileset.tileheight,
      tileMargin: tileset.margin ?? 0,
      tileSpacing: tileset.spacing ?? 0,
    };
  })
  .filter((tileset): tileset is TilesetImageConfig => tileset !== null);
