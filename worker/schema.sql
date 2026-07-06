CREATE TABLE IF NOT EXISTS rooms (
  roomId TEXT PRIMARY KEY,
  hostName TEXT,
  gameId TEXT,
  location TEXT,
  offer TEXT,
  createdAt INTEGER,
  expiresAt INTEGER
);

CREATE TABLE IF NOT EXISTS answers (
  roomId TEXT PRIMARY KEY,
  guestName TEXT,
  answer TEXT,
  createdAt INTEGER
);
