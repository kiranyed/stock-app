import { IStrategyRun, ILiveJobRunEntity } from "../types/entity-types";

const StrategyRunMapper = {
  convertRunToEntity(run: IStrategyRun): ILiveJobRunEntity {
    return {
      id: run.id,
      start_time: run.startTime,
      end_time: run.endTime,
      status: run.status,
      group_id: run.groupId,
      strategy_id: run.strategyId,
      position_size: run.positionSize,
      open_by: run.openBy,
      close_by: run.closeBy,
    };
  },
  convertEntityToRun(entity: ILiveJobRunEntity): IStrategyRun {
    return {
      id: entity.id,
      startTime: entity.start_time,
      endTime: entity.end_time,
      status: entity.status,
      groupId: entity.group_id,
      strategyId: entity.strategy_id,
      positionSize: entity.position_size,
      openBy: entity.open_by,
      closeBy: entity.close_by,
    };
  },
};

export default StrategyRunMapper;
