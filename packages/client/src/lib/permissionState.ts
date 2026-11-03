/** Add and edit actions stay visible when a person can't use them: disabled, with a short plain reason. Kept apart from the page so the server tests can import it. */

export interface ActionState {
  disabled: boolean;
  /** Shown as the button's title and read out as its description; absent when the action is allowed. */
  reason?: string;
}

export const actionState = (allowed: boolean, denied: string): ActionState =>
  allowed ? { disabled: false } : { disabled: true, reason: denied };

export const NO_ADD_ACCOUNT = "You don't have permission to add accounts";
export const NO_ADD_ASSET = "You don't have permission to add assets";
export const NO_EDIT_ASSET = "You don't have permission to edit assets";
