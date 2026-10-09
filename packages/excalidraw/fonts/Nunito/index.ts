import { GOOGLE_FONTS_RANGES } from "@excalidraw/common";

import { BOLD_FONT_WEIGHT } from "../ExcalidrawFontFace";
import { type ExcalidrawFontFaceDescriptor } from "../Fonts";

import Cyrilic from "./Nunito-Regular-XRXI3I6Li01BKofiOc5wtlZ2di8HDIkhdTA3j6zbXWjgevT5.woff2";
import Latin from "./Nunito-Regular-XRXI3I6Li01BKofiOc5wtlZ2di8HDIkhdTQ3j6zbXWjgeg.woff2";
import CyrilicExt from "./Nunito-Regular-XRXI3I6Li01BKofiOc5wtlZ2di8HDIkhdTk3j6zbXWjgevT5.woff2";
import LatinExt from "./Nunito-Regular-XRXI3I6Li01BKofiOc5wtlZ2di8HDIkhdTo3j6zbXWjgevT5.woff2";
import Vietnamese from "./Nunito-Regular-XRXI3I6Li01BKofiOc5wtlZ2di8HDIkhdTs3j6zbXWjgevT5.woff2";
// excalidraw-web: the bold faces: Google Fonts' static Nunito 700, v32
import CyrilicBold from "./Nunito-Bold-XRXI3I6Li01BKofiOc5wtlZ2di8HDFwmdTA3j77e.woff2";
import LatinBold from "./Nunito-Bold-XRXI3I6Li01BKofiOc5wtlZ2di8HDFwmdTQ3jw.woff2";
import CyrilicExtBold from "./Nunito-Bold-XRXI3I6Li01BKofiOc5wtlZ2di8HDFwmdTk3j77e.woff2";
import LatinExtBold from "./Nunito-Bold-XRXI3I6Li01BKofiOc5wtlZ2di8HDFwmdTo3j77e.woff2";
import VietnameseBold from "./Nunito-Bold-XRXI3I6Li01BKofiOc5wtlZ2di8HDFwmdTs3j77e.woff2";

export const NunitoFontFaces: ExcalidrawFontFaceDescriptor[] = [
  {
    uri: CyrilicExt,
    descriptors: {
      unicodeRange: GOOGLE_FONTS_RANGES.CYRILIC_EXT,
      weight: "500",
    },
  },
  {
    uri: Cyrilic,
    descriptors: { unicodeRange: GOOGLE_FONTS_RANGES.CYRILIC, weight: "500" },
  },
  {
    uri: Vietnamese,
    descriptors: {
      unicodeRange: GOOGLE_FONTS_RANGES.VIETNAMESE,
      weight: "500",
    },
  },
  {
    uri: LatinExt,
    descriptors: { unicodeRange: GOOGLE_FONTS_RANGES.LATIN_EXT, weight: "500" },
  },
  {
    uri: Latin,
    descriptors: { unicodeRange: GOOGLE_FONTS_RANGES.LATIN, weight: "500" },
  },
  {
    uri: CyrilicExtBold,
    descriptors: {
      unicodeRange: GOOGLE_FONTS_RANGES.CYRILIC_EXT,
      weight: BOLD_FONT_WEIGHT,
    },
  },
  {
    uri: CyrilicBold,
    descriptors: {
      unicodeRange: GOOGLE_FONTS_RANGES.CYRILIC,
      weight: BOLD_FONT_WEIGHT,
    },
  },
  {
    uri: VietnameseBold,
    descriptors: {
      unicodeRange: GOOGLE_FONTS_RANGES.VIETNAMESE,
      weight: BOLD_FONT_WEIGHT,
    },
  },
  {
    uri: LatinExtBold,
    descriptors: {
      unicodeRange: GOOGLE_FONTS_RANGES.LATIN_EXT,
      weight: BOLD_FONT_WEIGHT,
    },
  },
  {
    uri: LatinBold,
    descriptors: {
      unicodeRange: GOOGLE_FONTS_RANGES.LATIN,
      weight: BOLD_FONT_WEIGHT,
    },
  },
];
