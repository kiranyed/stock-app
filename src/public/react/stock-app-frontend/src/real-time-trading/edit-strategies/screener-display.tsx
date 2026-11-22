import * as React from "react";
import { IScreener } from "../../shared/types";
import { InitUtil } from "../../shared/utilities/init-util";
interface IProps {
  screener: IScreener;
  editScreener: React.MouseEventHandler<HTMLDivElement>;
}

export function ScreenerDisplay(props: IProps) {
  return (
    <div className={"chilling"} onClick={props.editScreener}>
      <label>Buy if: </label>
      <span>
        {props.screener.buySellFilters
          ? InitUtil.convertFilterGroupToString(
              props.screener.buySellFilters!.enter,
            )
          : null}
      </span>
      <br />
      <label>Sell if: </label>
      <span>
        {props.screener.buySellFilters
          ? InitUtil.convertFilterGroupToString(
              props.screener.buySellFilters!.exit,
            )
          : null}
      </span>
      <br />
      <label>Short if: </label>
      <span>
        {props.screener.shortCoverFilters
          ? InitUtil.convertFilterGroupToString(
              props.screener.shortCoverFilters!.enter,
            )
          : null}
      </span>
      <br />
      <label>Buy to cover if: </label>
      <span>
        {props.screener.shortCoverFilters
          ? InitUtil.convertFilterGroupToString(
              props.screener.shortCoverFilters!.exit,
            )
          : null}
      </span>
      <br />
    </div>
  );
}
