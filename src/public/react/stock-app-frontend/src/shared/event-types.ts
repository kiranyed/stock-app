import { FormEvent } from "primereact/ts-helpers";

export type DateChangeEvent = FormEvent<
  Date,
  React.SyntheticEvent<Element, Event>
>;

export interface GenericEvent {
  value: string;
}
