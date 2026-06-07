/**
 * Circuit-location name pool (name-neurons-maze-circuit-locations).
 *
 * Real LEARNING / long-term-potentiation (LTP) / memory-circuit neuroanatomical
 * & neurophysiological structures, used as Pikmin-Bloom provenance labels —
 * 「在 <zh> 尋獲的神經元」 for first-route crossing-synapses and
 * 「在 <zh> 解鎖的神經元」 for second-route (二回目) location variants.
 *
 * REPLACES the prior broad-anatomy pool (motor/sensory/visual/language/basal-
 * ganglia structures) per add-neurons-maze-second-lap-variants U1: the neurons app
 * is LTP/Hebbian-themed ("neurons that fire together, wire together"), so the pool
 * is now scoped to the hippocampal memory system + medial temporal lobe memory
 * network + the synaptic machinery of plasticity — every place here is one where
 * memory is encoded, replayed, or consolidated. As a consequence, first-route
 * synapse locations re-stamp to learning-circuit names on update (pure-derived
 * captions recompute; no stored-field migration).
 *
 * Grounded via OpenEvidence (oe_ask, 7 focused neuroscience queries) + canonical
 * PubMed review PMIDs, 2026-06-07. Per-name PMIDs / grounding notes:
 * ~/.claude/scratch/neurons-ltp-circuit-location-candidates-2026-06-07.md
 * 67 entries (round-robin repeats across ~226 maze positions are acceptable, as
 * the prior pool did). Build-time only — assigned into grid-graph.json by
 * apps/neurons-tw/scripts/assign-circuit-locations.mjs.
 */
export interface CircuitLocation {
  /** 中文 display name (shown in the provenance caption). */
  zh: string
  /** English name. */
  en: string
  /** Structure category (subfield / pathway / synapse / nucleus / phenomenon …). */
  type: string
}

export const CIRCUIT_LOCATIONS: CircuitLocation[] = [
  // --- Group 1: Hippocampal formation subfields (the memory engine) ---
  { zh: "齒狀回", en: "Dentate gyrus", type: "hippocampal subfield" },
  { zh: "海馬 CA3 區", en: "Hippocampal CA3", type: "hippocampal subfield" },
  { zh: "海馬 CA2 區", en: "Hippocampal CA2", type: "hippocampal subfield" },
  { zh: "海馬 CA1 區", en: "Hippocampal CA1", type: "hippocampal subfield" },
  { zh: "下托", en: "Subiculum", type: "hippocampal subfield (output)" },
  { zh: "前下托", en: "Presubiculum", type: "hippocampal subfield" },
  { zh: "旁下托", en: "Parasubiculum", type: "hippocampal subfield" },
  { zh: "阿蒙角", en: "Cornu Ammonis", type: "hippocampal subfield (collective)" },
  { zh: "海馬門（CA4）", en: "Hilus (CA4)", type: "hippocampal subfield" },

  // --- Group 2: Entorhinal interface & spatial-coding cells ---
  { zh: "外側內嗅皮質", en: "Lateral entorhinal cortex", type: "cortex (memory interface)" },
  { zh: "內側內嗅皮質", en: "Medial entorhinal cortex", type: "cortex (memory interface)" },
  { zh: "內嗅皮質第二層", en: "Entorhinal cortex layer II", type: "cortex (memory interface)" },
  { zh: "內嗅皮質第三層", en: "Entorhinal cortex layer III", type: "cortex (memory interface)" },
  { zh: "網格細胞模組", en: "Grid-cell module", type: "phenomenon (spatial code)" },
  { zh: "位置細胞場", en: "Place-cell field", type: "phenomenon (spatial code)" },
  { zh: "頭向細胞環路", en: "Head-direction cell circuit", type: "circuit (spatial code)" },

  // --- Group 3: Intrahippocampal pathways & memory white matter ---
  { zh: "穿通通路", en: "Perforant path", type: "pathway (entorhinal→DG)" },
  { zh: "內側穿通通路", en: "Medial perforant path", type: "pathway (entorhinal→DG)" },
  { zh: "外側穿通通路", en: "Lateral perforant path", type: "pathway (entorhinal→DG)" },
  { zh: "海馬苔狀纖維", en: "Hippocampal mossy fibers", type: "pathway/synapse (DG→CA3)" },
  { zh: "Schaffer 側支", en: "Schaffer collaterals", type: "pathway/synapse (CA3→CA1)" },
  { zh: "顳-阿蒙通路", en: "Temporoammonic pathway", type: "pathway (EC III→CA1)" },
  { zh: "穹窿", en: "Fornix", type: "tract (limbic output)" },
  { zh: "海馬傘", en: "Fimbria", type: "tract (limbic output)" },
  { zh: "海馬槽", en: "Alveus", type: "tract (limbic output)" },
  { zh: "角束", en: "Angular bundle", type: "tract (entorhinal)" },
  { zh: "海馬連合", en: "Hippocampal commissure", type: "tract (commissural)" },
  { zh: "齒狀苔狀細胞聯絡通路", en: "Dentate mossy-cell associational pathway", type: "pathway (intra-DG)" },

  // --- Group 4: Synapse & plasticity machinery (the molecular LTP scene) ---
  { zh: "Schaffer-CA1 長期增益突觸", en: "Schaffer collateral–CA1 LTP synapse", type: "synapse (plasticity)" },
  { zh: "NMDA 受體突觸", en: "NMDA-receptor synapse", type: "synapse (plasticity)" },
  { zh: "沉默突觸", en: "Silent synapse", type: "synapse (plasticity)" },
  { zh: "樹突棘", en: "Dendritic spine", type: "structure (plasticity)" },
  { zh: "蕈狀樹突棘", en: "Mushroom spine", type: "structure (plasticity)" },
  { zh: "突觸後緻密區", en: "Postsynaptic density", type: "structure (plasticity)" },
  { zh: "長期抑制突觸", en: "Long-term depression synapse (LTD)", type: "synapse (plasticity)" },
  { zh: "θ 叢發長期增益位點", en: "Theta-burst LTP induction site", type: "phenomenon (plasticity)" },
  { zh: "記憶印痕細胞群", en: "Memory engram ensemble", type: "phenomenon (plasticity)" },
  { zh: "印痕分配熱點", en: "Engram allocation hotspot", type: "phenomenon (plasticity)" },
  { zh: "突觸標記捕獲位點", en: "Synaptic tagging-and-capture site", type: "phenomenon (plasticity)" },
  { zh: "籃狀細胞胞周突觸", en: "Perisomatic basket-cell synapse", type: "synapse (inhibitory)" },
  { zh: "軸-軸（燭台細胞）突觸", en: "Axo-axonic (chandelier) synapse", type: "synapse (inhibitory)" },
  { zh: "三方突觸", en: "Tripartite synapse", type: "synapse (glial)" },

  // --- Group 5: Papez circuit & extended limbic memory system ---
  { zh: "Papez 環路", en: "Papez circuit", type: "circuit (limbic memory)" },
  { zh: "海馬三突觸環路", en: "Hippocampal trisynaptic circuit", type: "circuit (memory)" },
  { zh: "乳頭體", en: "Mammillary bodies", type: "nucleus (diencephalic memory)" },
  { zh: "乳頭丘腦束", en: "Mammillothalamic tract", type: "tract (diencephalic memory)" },
  { zh: "丘腦前核", en: "Anterior thalamic nucleus", type: "nucleus (diencephalic memory)" },
  { zh: "扣帶束", en: "Cingulum", type: "tract (limbic)" },
  { zh: "扣帶回", en: "Cingulate gyrus", type: "cortex (limbic memory)" },
  { zh: "海馬旁回", en: "Parahippocampal gyrus", type: "cortex (memory interface)" },
  { zh: "壓後皮質", en: "Retrosplenial cortex", type: "cortex (consolidation)" },
  { zh: "基底外側杏仁核", en: "Basolateral amygdala", type: "nucleus (emotional memory)" },
  { zh: "杏仁核記憶印痕", en: "Amygdala memory engram", type: "phenomenon (emotional memory)" },
  { zh: "海馬-前額葉通路", en: "Hippocampal–prefrontal pathway", type: "pathway (consolidation)" },
  { zh: "內側前額葉記憶印痕", en: "Medial prefrontal cortex memory engram", type: "cortex (consolidation)" },

  // --- Group 6: Neuromodulatory inputs & oscillatory consolidation ---
  { zh: "內側中隔", en: "Medial septum", type: "nucleus (theta pacemaker)" },
  { zh: "Broca 斜角帶", en: "Diagonal band of Broca", type: "nucleus (cholinergic)" },
  { zh: "中隔海馬通路", en: "Septohippocampal pathway", type: "pathway (theta)" },
  { zh: "Meynert 基底核", en: "Nucleus basalis of Meynert", type: "nucleus (cholinergic)" },
  { zh: "藍斑核", en: "Locus coeruleus", type: "nucleus (noradrenergic)" },
  { zh: "藍斑-海馬正腎上腺素投射", en: "LC–hippocampus noradrenergic projection", type: "pathway (consolidation)" },
  { zh: "腹側被蓋-海馬迴路", en: "Ventral tegmental area–hippocampus loop", type: "circuit (dopaminergic)" },
  { zh: "海馬 θ 節律", en: "Hippocampal theta rhythm", type: "phenomenon (oscillation)" },
  { zh: "θ-γ 相位耦合", en: "Theta-gamma phase coupling", type: "phenomenon (oscillation)" },
  { zh: "尖波漣漪", en: "Sharp-wave ripple", type: "phenomenon (oscillation)" },
  { zh: "海馬重播序列", en: "Hippocampal replay sequence", type: "phenomenon (consolidation)" },
  { zh: "皮質-海馬對話", en: "Cortico-hippocampal dialogue", type: "circuit (consolidation)" },
]
