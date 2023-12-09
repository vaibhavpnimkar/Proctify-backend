const Pool = require("pg").Pool;

const pool = new Pool({
  user: "proctopostgre",
  host: "database-1.clhgusjwefwj.ap-south-1.rds.amazonaws.com",
  database: "proctor",
  password: "Krishna02",
  port: 5432,
  ssl: { rejectUnauthorized: false },
});

async function queryDatabase() {
  const client = await pool.connect();
  try {
    const result = await client.query("SELECT NOW() as current_time");
    // console.log("Database is warm. Current time:", result.rows[0].current_time);
  } catch (error) {
    console.error("Error querying database:", error);
  } finally {
    client.release();
  }
}

const queryInterval = 10000;

setInterval(queryDatabase, queryInterval);

module.exports = pool;
