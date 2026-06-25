/**
 * deriveConnectionStatus
 * 
 * Single source of truth for student connection status display.
 * Combines socket connection (left/online) with focus state (fullscreen and tab visibility).
 * 
 * @param {Object} student - student object containing status/is_fullscreen/outOfFocus/isLeft
 * @param {Object} [options] - display options
 * @param {boolean} [options.useActive=false] - return 'active' instead of 'live' for focused state
 * @returns {string} - 'left' | 'idle' | 'live' | 'active' | 'offline'
 */
export function deriveConnectionStatus(student, options = {}) {
  if (!student) return 'offline';

  // 1. Check if student has left/disconnected
  if (student.status === 'left' || student.isLeft) {
    return 'left';
  }
  if (student.status === 'offline') {
    return 'offline';
  }

  // 2. Check focus/presence state
  // is_fullscreen on student status payload is true only when the student is active,
  // in fullscreen, AND the tab is visible. If they exit fullscreen OR switch tabs,
  // is_fullscreen is set to false, meaning they are "Not Viewing" (idle).
  // We also check outOfFocus and is_fullscreen directly.
  const isNotViewing = student.is_fullscreen === false || student.outOfFocus === true || student.status === 'idle';
  
  if (isNotViewing) {
    return 'idle'; // NOT VIEWING (Amber)
  }

  // 3. Otherwise student is connected and active (Green)
  return options.useActive ? 'active' : 'live';
}
