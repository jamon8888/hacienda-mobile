import React from "react";
import renderer from "react-test-renderer";
import LogoIcon from "./index";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      Ghost: any;
    }
  }
}

jest.mock("phosphor-react-native", () => {
  const React = jest.requireActual("react");
  return {
    Ghost: React.forwardRef((props: any, ref: any) => {
      return React.createElement("Ghost", { ...props, ref });
    }),
  };
});

describe("LogoIcon", () => {
  it("renders the Ghost icon with default props", () => {
    const tree = renderer.create(<LogoIcon />);
    const root = tree.root;
    const ghost = root.findByType("Ghost");
    expect(ghost.props.size).toBe(40);
    expect(ghost.props.color).toBe("#FFF");
    expect(ghost.props.weight).toBe("fill");
  });

  it("accepts custom size, color, and weight", () => {
    const tree = renderer.create(
      <LogoIcon size={80} color="#000" weight="bold" />,
    );
    const root = tree.root;
    const ghost = root.findByType("Ghost");
    expect(ghost.props.size).toBe(80);
    expect(ghost.props.color).toBe("#000");
    expect(ghost.props.weight).toBe("bold");
  });
});
