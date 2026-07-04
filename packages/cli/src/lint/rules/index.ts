import type { Rule } from '../types.js';
import { sf001 } from './sf001-skill-md-present.js';
import { sf002 } from './sf002-frontmatter-parses.js';
import { sf003 } from './sf003-required-fields.js';
import { sf004 } from './sf004-name-matches-folder.js';
import { sf005 } from './sf005-unique-names.js';
import { sf006 } from './sf006-semver.js';
import { sf007 } from './sf007-description-quality.js';
import { sf008 } from './sf008-dead-links.js';
import { sf009 } from './sf009-skill-budget.js';
import { sf010 } from './sf010-tree-budget.js';
import { sf011 } from './sf011-credentials.js';
import { sf012 } from './sf012-secrets-declared.js';
import { sf013 } from './sf013-orchestrator-refs.js';
import { sf014 } from './sf014-scripts-executable.js';
import { sf015 } from './sf015-unknown-fields.js';

export const ALL_RULES: Rule[] = [
  sf001, sf002, sf003, sf004, sf005, sf006, sf007, sf008,
  sf009, sf010, sf011, sf012, sf013, sf014, sf015,
];
