// Research only. Call inside cutter-connect's onAuthenticated callback after the
// operator explicitly authorizes homing and prepares the machine (blade removed).
// This module does not connect, obtain credentials, or run on import.
async function homeIdleDevice(device) {
  const before = await device.moveSkill.getCarriageStatus();
  if (before.carriageState !== 'idle' || before.queuedMovesCount !== 0)
    throw new Error('Carriage must be idle with no queued moves before homing');
  await device.uxStateMachineSkill.enterActiveState();
  try {
    await device.homeAxesSkill.homeAxes(true, true);
    await device.homeAxesSkill.waitUntilHomeFinished();
    const after = await device.moveSkill.getCarriageStatus();
    if (after.carriageState !== 'idle' || after.queuedMovesCount !== 0)
      throw new Error('Homing did not return to idle with no queued moves');
    return {
      test: 'SDK homeAxes(true,true)',
      homeCompleted: true,
      before: { state: before.carriageState, queuedMoves: before.queuedMovesCount },
      after: { state: after.carriageState, queuedMoves: after.queuedMovesCount },
    };
  } finally {
    // Return SDK UX state to idle. This is not an emergency stop or a physical cancel.
    await device.uxStateMachineSkill.exitActiveState();
  }
}
module.exports = { homeIdleDevice };
