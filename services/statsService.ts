// Simple local storage wrapper for reading statistics
export interface ReadingStats {
  lastReadDate: string; // ISO Date string (YYYY-MM-DD)
  dailyMinutes: number;
  streak: number;
  totalMinutes: number;
  dailyGoal: number; // in minutes, default 30
}

const STATS_KEY = 'lumina-reading-stats';

const getTodayDateString = () => {
  return new Date().toISOString().split('T')[0];
};

export const getReadingStats = (): ReadingStats => {
  if (typeof window === 'undefined') {
    return { lastReadDate: getTodayDateString(), dailyMinutes: 0, streak: 0, totalMinutes: 0, dailyGoal: 30 };
  }

  const stored = localStorage.getItem(STATS_KEY);
  if (!stored) {
    const defaultStats: ReadingStats = {
      lastReadDate: getTodayDateString(),
      dailyMinutes: 0,
      streak: 0,
      totalMinutes: 0,
      dailyGoal: 30
    };
    localStorage.setItem(STATS_KEY, JSON.stringify(defaultStats));
    return defaultStats;
  }

  const stats: ReadingStats = JSON.parse(stored);
  const today = getTodayDateString();

  // Reset daily minutes if it's a new day
  if (stats.lastReadDate !== today) {
    stats.dailyMinutes = 0;
    // Do not update lastReadDate here, we wait until user actually logs time
  }

  return stats;
};

export const updateReadingTime = (seconds: number): { stats: ReadingStats, goalReached: boolean } => {
  const stats = getReadingStats();
  const today = getTodayDateString();
  const minutesToAdd = seconds / 60;
  
  const wasGoalReached = stats.dailyMinutes >= stats.dailyGoal;
  
  stats.totalMinutes += minutesToAdd;

  // Day logic
  if (stats.lastReadDate !== today) {
    // Check if the streak is broken
    const lastDate = new Date(stats.lastReadDate);
    const currentDate = new Date(today);
    const diffTime = Math.abs(currentDate.getTime() - lastDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

    if (diffDays === 1) {
      // Consecutive day
      stats.streak += 1;
    } else if (diffDays > 1) {
      // Streak broken
      stats.streak = 1;
    } else {
      // Same day (should technically be caught by outer check, but safe fallback)
      if (stats.streak === 0) stats.streak = 1;
    }
    
    stats.lastReadDate = today;
    stats.dailyMinutes = minutesToAdd; // Reset and add current session
  } else {
    // Same day
    stats.dailyMinutes += minutesToAdd;
  }

  localStorage.setItem(STATS_KEY, JSON.stringify(stats));

  // Check if goal reached JUST NOW
  const isGoalReached = stats.dailyMinutes >= stats.dailyGoal;
  
  return { 
    stats, 
    goalReached: !wasGoalReached && isGoalReached 
  };
};

export const setDailyGoal = (minutes: number) => {
  const stats = getReadingStats();
  stats.dailyGoal = minutes;
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  return stats;
};