import { describe, expect, it } from 'vitest';
import { tapTwoStep } from '../../client/src/lib/twoStepConfirm';

describe('tapTwoStep', () => {
  it('the first tap arms the button without running the action', () => {
    expect(tapTwoStep(false)).toEqual({ armed: true, run: false });
  });

  it('the second tap runs the action and disarms', () => {
    expect(tapTwoStep(true)).toEqual({ armed: false, run: true });
  });
});
