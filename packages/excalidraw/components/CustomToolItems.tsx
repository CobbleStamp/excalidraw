/**
 * The host's custom tools (`props.customTools`) as items of the "more tools"
 * menu, shared by the desktop and mobile toolbars.
 */
import DropdownMenu from "./dropdownMenu/DropdownMenu";
import { isToolButtonDisabled } from "./Tools";

import type { AppClassProperties, CustomTool, UIAppState } from "../types";

/** The host's custom tool that is active, if one is. */
export const getActiveCustomTool = (
  app: AppClassProperties,
  activeTool: UIAppState["activeTool"],
): CustomTool | undefined =>
  activeTool.type === "custom"
    ? app.props.customTools?.find(
        (tool) => tool.customType === activeTool.customType,
      )
    : undefined;

/** Renders one menu item per custom tool; choosing one makes it the active tool. */
export const CustomToolItems = ({
  app,
  activeTool,
}: {
  app: AppClassProperties;
  activeTool: UIAppState["activeTool"];
}) => {
  const activeCustomTool = getActiveCustomTool(app, activeTool);
  return (
    <>
      {app.props.customTools?.map((tool) => (
        <DropdownMenu.Item
          key={tool.customType}
          onSelect={() =>
            app.setActiveTool({ type: "custom", customType: tool.customType })
          }
          icon={tool.icon}
          shortcut={tool.key?.toLocaleUpperCase()}
          data-testid={`toolbar-custom-${tool.customType}`}
          selected={tool === activeCustomTool}
          disabled={isToolButtonDisabled(app, "custom")}
        >
          {tool.label}
        </DropdownMenu.Item>
      ))}
    </>
  );
};
