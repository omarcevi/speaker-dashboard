// Shared data types and constants. Must stay import-free: the web app bundles STATUSES/ROLES from here.
export type Ts = { toMillis(): number };

export const STATUSES = ['pending', 'maybe', 'approved', 'declined'] as const;
export type Status = typeof STATUSES[number];
export const ROLES = ['waiting', 'member', 'admin', 'removed'] as const;
export type Role = typeof ROLES[number];

export interface CoSpeaker {
  firstName: string; lastName: string; bio: string; email: string; phone: string;
  linkedin: string; x: string; instagram: string; photoUrl: string;
}
export interface Logistics {
  fromAbroad: string; abroadFrom: string; transport: string; accommodation: string; tour: string;
  outsideIstanbul: string; city: string; otherRequirements: string; tshirt: string; afterParty: string;
}
export interface SubmissionData {
  id: string; row: number; timestamp: string; speakerKey: string;
  firstName: string; lastName: string; email: string; company: string; jobTitle: string; phone: string; bio: string; gde: string;
  links: { linkedin: string; x: string; instagram: string; github: string };
  photoUrl: string; photoFileId: string | null; speakingExperience: string; whyDevFest: string; anythingElse: string;
  topic: string; topicGroup: string; title: string; abstract: string; takeaways: string; level: string; language: string;
  presentedBefore: string; talkHistory: string; noSession: boolean;
  coSpeaker: CoSpeaker | null; logistics: Logistics;
  consent: { codeOfConduct: string; recording: string; personalData: string }; // '' = not answered
  contentHash: string;
}
export interface Submission extends SubmissionData { removedFromSheet: boolean; syncedAt: Ts }
export interface Review { status: Status; updatedAt: Ts; updatedBy: string; updatedByName: string } // reviews/{submissionId}
export interface StatusChange { from: Status; to: Status; by: string; byName: string; at: Ts } // reviews/{id}/history/{auto}
export interface Score { submissionId: string; uid: string; name: string; value: number; updatedAt: Ts } // scores/{submissionId}__{uid}
export interface Comment { submissionId: string; uid: string; name: string; text: string; createdAt: Ts; editedAt: Ts | null } // comments/{auto}
export interface UserDoc { email: string; name: string; photoURL: string; role: Role; createdAt: Ts } // users/{uid}
export interface SyncResult { added: number; updated: number; removed: number; total: number; missingColumns: string[] }
// meta/sync. A failed first sync writes only error + lastErrorAt, so everything else may be absent.
export interface SyncMeta extends Partial<SyncResult> { lastSyncedAt?: Ts | null; error: string | null; lastErrorAt: Ts | null }
