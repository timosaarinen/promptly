// src/utils/globRuleProcessor.ts
import * as micromatch from 'micromatch';
import { parsePathWithImportance, getPrefixedPath } from './fileTreeUtils';

interface Rule {
  pattern: string;
  isRemoval: boolean;
  importance: number;
  originalRule: string;
}

function parseSingleRule(ruleString: string): Rule {
  let mutableRuleString = ruleString.trim();
  const isRemoval = mutableRuleString.startsWith('-');
  if (isRemoval) {
    mutableRuleString = mutableRuleString.substring(1);
  }

  // Use parsePathWithImportance to handle '+' prefixes and get clean path
  // It expects paths, but its '+' parsing logic is what we need.
  // The 'cleanPath' it returns will be our pattern here.
  const { cleanPath: pattern, importance: parsedImportance } = parsePathWithImportance(mutableRuleString);

  return {
    pattern,
    isRemoval,
    importance: isRemoval ? 0 : parsedImportance,
    originalRule: ruleString,
  };
}

/**
 * Applies a list of selection rules (supporting globs, importance, and removal)
 * to a list of all file paths in a project.
 *
 * @param allFilePaths An array of all relative file paths in the project.
 * @param ruleStrings An array of rule strings (e.g., `"*.ts"`, `"+src/**"`).
 * @returns An array of explicit file paths (with importance prefixes) that should be selected.
 */
export function applyRulesToPathList(allFilePaths: string[], ruleStrings: string[]): string[] {
  if (ruleStrings.length === 0) {
    return []; // No rules, no selection change based on rules.
  }

  const parsedRules = ruleStrings.map(parseSingleRule);
  const finalFileStates = new Map<string, { selected: boolean; importance: number }>();

  // Derive all unique directory paths from the list of all file paths
  const allDirPaths = new Set<string>();
  for (const filePath of allFilePaths) {
    const parts = filePath.split('/');
    let currentCompositePath = '';
    for (let i = 0; i < parts.length - 1; i++) {
      // Exclude the filename part
      currentCompositePath = currentCompositePath ? `${currentCompositePath}/${parts[i]}` : parts[i];
      if (currentCompositePath) {
        allDirPaths.add(currentCompositePath);
      }
    }
  }

  for (const filePath of allFilePaths) {
    let currentSelected = false; // Default: file is not selected by rules unless a rule adds it.
    let currentImportance = 0;

    for (const rule of parsedRules) {
      let matchPattern = rule.pattern;
      // Check if the pattern contains any glob magic characters
      const scanInfo = micromatch.scan(rule.pattern);
      const isPotentialDirPath = !scanInfo.isGlob;

      if (isPotentialDirPath && (allDirPaths.has(rule.pattern) || rule.pattern.endsWith('/'))) {
        // If the rule pattern is a known directory or ends with '/', treat it as a directory glob
        matchPattern = rule.pattern.endsWith('/') ? rule.pattern + '**' : rule.pattern + '/**';
      }

      if (micromatch.isMatch(filePath, matchPattern)) {
        if (rule.isRemoval) {
          currentSelected = false;
          currentImportance = 0;
        } else {
          currentSelected = true;
          currentImportance = rule.importance;
        }
      }
    }

    if (currentSelected) {
      finalFileStates.set(filePath, { selected: true, importance: currentImportance });
    }
  }

  const explicitPathsToSelect: string[] = [];
  for (const [path, state] of finalFileStates.entries()) {
    if (state.selected) {
      explicitPathsToSelect.push(getPrefixedPath(path, state.importance));
    }
  }

  return explicitPathsToSelect;
}
