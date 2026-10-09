import { BOLD_FONT_WEIGHT } from "../ExcalidrawFontFace";
import { type ExcalidrawFontFaceDescriptor } from "../Fonts";

// excalidraw-web: the bold face: Liberation Sans 2.1.5 Bold, cut to the regular face's characters
import LiberationSansBold from "./LiberationSans-Bold.woff2";
import LiberationSansRegular from "./LiberationSans-Regular.woff2";

export const LiberationFontFaces: ExcalidrawFontFaceDescriptor[] = [
  {
    uri: LiberationSansRegular,
  },
  {
    uri: LiberationSansBold,
    descriptors: { weight: BOLD_FONT_WEIGHT },
  },
];
