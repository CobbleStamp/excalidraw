import { BOLD_FONT_WEIGHT } from "../ExcalidrawFontFace";
import { type ExcalidrawFontFaceDescriptor } from "../Fonts";

// excalidraw-web: the bold face: Cascadia Code 2407.24 Bold, cut to the regular face's characters
import CascadiaCodeBold from "./CascadiaCode-Bold.woff2";
import CascadiaCodeRegular from "./CascadiaCode-Regular.woff2";

export const CascadiaFontFaces: ExcalidrawFontFaceDescriptor[] = [
  {
    uri: CascadiaCodeRegular,
  },
  {
    uri: CascadiaCodeBold,
    descriptors: { weight: BOLD_FONT_WEIGHT },
  },
];
