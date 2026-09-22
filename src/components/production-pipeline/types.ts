export type StageKind = "process" | "qc";

export type StageIconName =
  | "knit"
  | "dye"
  | "cut"
  | "print"
  | "qc"
  | "sew"
  | "trim"
  | "steam"
  | "pack"
  | "dispatch";

export interface PipelineStage {
  id: string;
  // Global position in the flow, 1 to 13
  order: number;
  title: string;
  text: string;
  kind: StageKind;
  icon: StageIconName;
}

export interface PipelineZone {
  id: string;
  order: number;
  label: string;
  stages: PipelineStage[];
}
