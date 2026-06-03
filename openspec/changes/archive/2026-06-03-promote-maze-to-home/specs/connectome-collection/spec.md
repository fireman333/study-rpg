## REMOVED Requirements

### Requirement: Connectome homepage view SHALL display all 11 families grouped by NT branch on the homepage with a dimmed-skeleton empty state

**Reason**: The maze brain-map replaces the connectome tree as the homepage centerpiece (`neurons-homepage` MODIFIED). The synapse network's display surface moves to the maze overlay; the per-family card detail (displayName / sprite / AP / 🧬 chip / `firedToday` badge) is owned by the maze-home enriched `FamilyPicker` grid (`neurons-homepage`). The dimmed-skeleton + N=5 co-fire empty-state guidance is superseded by the maze fog-of-war + first-visit onboarding.

**Migration**: Family-card content requirement is satisfied by the `neurons-homepage` "single enriched family grid" requirement. Synapse display is satisfied by the `neurons-brain-maze` "Synapse network overlay on the maze brain-map" requirement. The N=5 co-fire guidance moves to the homepage onboarding / help surface. The synapse co-fire MECHANIC (creation / state machine / decay / daily reset) is unchanged and remains in this capability.

### Requirement: Polished SVG Linnean phylogenetic tree SHALL render the connectome on the homepage with two-channel recency-and-strength edge styling

**Reason**: The Linnean SVG tree (`ConnectomeTreeSvg` + `FamilyNode` / `SynapseEdge` / `force-sim` / `graph-builder`) is retired as the homepage centerpiece in favor of the maze brain-map. Synapses are no longer drawn as tree edges.

**Migration**: Synapse edges are now rendered as an overlay on the maze brain-map between co-firing families' node-cluster positions, per the `neurons-brain-maze` "Synapse network overlay on the maze brain-map" requirement (edge visual weight reflects synapse state). The two-channel strength/recency styling MAY be carried over to the overlay as a visual refinement but is no longer a normative tree requirement.

### Requirement: SVG tree synapse formation, strengthening, decay, and slot-unlock SHALL drive Framer Motion animations gated by useRespectsReducedMotion

**Reason**: These animations were specific to the retired `ConnectomeTreeSvg` tree edges and leaf nodes. With the tree removed, the tree-specific Framer Motion transitions no longer apply.

**Migration**: The maze synapse overlay updates as synapse state changes (formation / strengthening / decay) per the `neurons-brain-maze` overlay requirement and SHALL continue to honor `useRespectsReducedMotion`. The synapse-formation/strengthening toast (this capability's separate, unchanged requirement) is unaffected. The synapse co-fire mechanic and its events (`connectome.synapseFormed` / `synapseStrengthened` / `synapseDecayed`) are unchanged.
