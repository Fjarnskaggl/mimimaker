# StepNav

The header's step nav is the spine of the app: **1 Design · 2 Light · 3 Make · 4 Build**. Each step owns its tools; nothing from another step shows on the stage.

The numbers are real order: you can jump around, but this is the sequence a kit is made in. The steps sit on a card strip with a corrugated lip. The current step has `aria-current="step"` and is a piece of caramel tape (`caramel` fill, `on-caramel` text and number, the `caramel-edge` lip). A finished step gets a `success` ring. Labels are single verbs. Never add a fifth step; new tools go inside a step.
