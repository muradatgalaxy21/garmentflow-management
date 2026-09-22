import type { PipelineZone } from "./types";

export const PIPELINE_ZONES: PipelineZone[] = [
  {
    id: "fabric-prep",
    order: 1,
    label: "Fabric & Prep",
    stages: [
      { id: "knitting", order: 1, title: "Knitting", text: "Yarn is knitted into tubular fabric on circular knitting machines.", kind: "process", icon: "knit" },
      { id: "dyeing-finishing", order: 2, title: "Dyeing & Finishing", text: "Colour treatment and stenter-frame finishing for shade, width, and hand-feel.", kind: "process", icon: "dye" },
      { id: "cutting", order: 3, title: "Cutting", text: "Multi-ply fabric spreading and precise pattern cutting into garment panels.", kind: "process", icon: "cut" },
    ],
  },
  {
    id: "embellishment-cut-qc",
    order: 2,
    label: "Embellishment & Cut QC",
    stages: [
      { id: "printing-embroidery", order: 4, title: "Printing / Embroidery / Sticker", text: "Screen prints, embroidery, and heat-transfer stickers applied to cut panels.", kind: "process", icon: "print" },
      { id: "qc-gate-1", order: 5, title: "QC Gate 1: Cut Panel Audit", text: "Panels checked for shade, measurement, and cutting defects before sewing.", kind: "qc", icon: "qc" },
    ],
  },
  {
    id: "sewing-hall",
    order: 3,
    label: "Sewing Hall",
    stages: [
      { id: "stitching-input", order: 6, title: "Stitching Hall Input", text: "Audited panel bundles are issued to sewing lines by style and size.", kind: "process", icon: "sew" },
      { id: "singer-overlock-flat", order: 7, title: "Singer / Overlock / Flat", text: "Single-needle, overlock, and flatlock machines assemble the garment.", kind: "process", icon: "sew" },
      { id: "buttoning-trims", order: 8, title: "Buttoning & Trims", text: "Buttons, labels, and trims attached to buyer specification.", kind: "process", icon: "trim" },
      { id: "qc-gate-2", order: 9, title: "QC Gate 2: In-line QC", text: "In-line checkers catch stitching faults while garments are still on the line.", kind: "qc", icon: "qc" },
    ],
  },
  {
    id: "finishing-dispatch",
    order: 4,
    label: "Finishing & Dispatch",
    stages: [
      { id: "steam-press", order: 10, title: "Steam Press", text: "Industrial steam pressing for a crisp, shipment-ready finish.", kind: "process", icon: "steam" },
      { id: "qc-gate-3", order: 11, title: "QC Gate 3: Final AQL Audit", text: "Final inspection sampled to AQL standards before packing is released.", kind: "qc", icon: "qc" },
      { id: "packing", order: 12, title: "Packing & Polybagging", text: "Folding, polybagging, and carton packing with barcode labelling.", kind: "process", icon: "pack" },
      { id: "warehouse-dispatch", order: 13, title: "Warehouse Dispatch", text: "Cartons staged in the warehouse and shipped with full export documentation.", kind: "process", icon: "dispatch" },
    ],
  },
];
