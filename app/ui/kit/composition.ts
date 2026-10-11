// Checked through each source and its reachable private helpers; the gallery links each building block.
export const compositions = [
  {
    source: 'supporting-pane.tsx',
    families: ['supporting-pane'],
    primitives: ['AutoScrollArea', 'Dock', 'Drawer'],
  },
  {
    source: 'theme.tsx',
    families: ['settings'],
    primitives: ['Icon', 'RadioGroup', 'RadioGroupItem', 'RadioGroupIndicator', 'Text'],
  },
  {
    source: 'conversation.tsx',
    families: ['agent', 'agent-panel', 'voice'],
    primitives: [
      'Button',
      'Form',
      'Icon',
      'InputGroup',
      'InputGroupAddon',
      'InputGroupTextarea',
      'OptionStrip',
      'Prose',
      'Stack',
      'Surface',
      'Text',
    ],
  },
  {
    source: 'settings.tsx',
    families: ['settings'],
    primitives: [
      'Field',
      'FieldContent',
      'FieldDescription',
      'FieldLabel',
      'FieldTitle',
      'Heading',
      'Drawer',
      'Surface',
    ],
  },
] as const;
