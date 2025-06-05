// src/store/parseAtoms.ts
import { atom } from 'jotai';

export interface ParsedChangeBase {
  type: 'timestamp' | 'plan' | 'create' | 'edit' | 'delete' | 'request' | 'message';
  path?: string;
  reason?: string;
}
export interface TimestampChange extends ParsedChangeBase {
  type: 'timestamp';
  content: string;
}
export interface PlanChange extends ParsedChangeBase {
  type: 'plan';
  content: string;
}
export interface FileWriteChange extends ParsedChangeBase {
  type: 'create';
  path: string;
  content: string;
}
export interface FileDiffChange extends ParsedChangeBase {
  type: 'edit';
  path: string;
  diffType: 'search-replace' | 'unified-diff';
  diffContent: string;
  searchText?: string;
  replaceText?: string;
}
export interface FileDeleteChange extends ParsedChangeBase {
  type: 'delete';
  path: string;
}
export interface FileRequestChange extends ParsedChangeBase {
  type: 'request';
  path: string;
}
export interface MessageChange extends ParsedChangeBase {
  type: 'message';
  content: string;
  purpose?: string;
}

export type ParsedChange =
  | TimestampChange
  | PlanChange
  | FileWriteChange
  | FileDiffChange
  | FileDeleteChange
  | FileRequestChange
  | MessageChange;

export enum ApplyItemStatus {
  PENDING_VALIDATION = 'pending_validation',
  VALIDATION_SUCCESS = 'validation_success',
  VALIDATION_FAILED_NO_FILE = 'validation_failed_no_file',
  VALIDATION_FAILED_SEARCH_NOT_FOUND = 'validation_failed_search_not_found',
  VALIDATION_FAILED_IDENTICAL_CONTENT = 'validation_failed_identical_content',
  VALIDATION_TOLERANT_MATCH_PENDING_STRICT_APPLY = 'validation_tolerant_match_pending_strict_apply',
  APPLIED_SUCCESS = 'applied_success',
  APPLIED_FAILED = 'applied_failed',
  SKIPPED_BY_USER = 'skipped_by_user',
  USER_RESOLVED = 'user_resolved',
}

export type ChangeWithApplyStatus = ParsedChange & {
  applyStatus: ApplyItemStatus;
  applyError?: string;
  // For VALIDATION_FAILED_SEARCH_NOT_FOUND or VALIDATION_FAILED_IDENTICAL_CONTENT on an 'edit' type,
  // these are populated from the FileDiffChange's searchText/replaceText fields.
  failedSearchText?: string;
  failedReplaceText?: string;
};

export const parsedLlmChangesAtom = atom<ChangeWithApplyStatus[]>([]);
