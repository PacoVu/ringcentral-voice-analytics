var async = require("async");
require('dotenv').load()

const { Pool, Client } = require('pg')
const pool = new Pool({
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  port: process.env.PGPORT,
})

module.exports = {
  create_table: (table, callback) => {
    var index = table.indexOf("user_")
    console.log("INDEX:" + index)
    if (table.indexOf("user_") >= 0){
      console.log("table: " + table)
      return pool.query(
        'CREATE TABLE IF NOT EXISTS ' + table + '(uid BIGINT PRIMARY KEY, rec_id VARCHAR(20) NOT NULL, call_date BIGINT NOT NULL, call_type VARCHAR(3) NOT NULL, extension_id VARCHAR(10) NOT NULL, extension_num VARCHAR(6) NOT NULL, full_name VARCHAR(48) NOT NULL, from_number VARCHAR(20) NOT NULL, from_name VARCHAR(48) NOT NULL, to_number VARCHAR(20) NOT NULL, to_name VARCHAR(48) NOT NULL, recording_url VARCHAR(256) NOT NULL, duration INT DEFAULT 0, direction VARCHAR(3) NOT NULL, processed INT NOT NULL, wordsandoffsets TEXT NOT NULL, transcript TEXT NOT NULL,conversations TEXT NOT NULL, sentiments TEXT NOT NULL, sentiment_label VARCHAR(8) NOT NULL, sentiment_score double precision NOT NULL, sentiment_score_hi double precision NOT NULL, sentiment_score_low double precision NOT NULL, has_profanity BOOLEAN NOT NULL, profanities TEXT NOT NULL, keywords TEXT NOT NULL, entities TEXT NOT NULL, concepts TEXT NOT NULL, categories TEXT NOT NULL, actions TEXT NOT NULL, subject VARCHAR(256) NOT NULL)', callback);
    }else if (table == "subscriptionids"){
      return pool.query(
        'CREATE TABLE IF NOT EXISTS ' + table + '(ext_id BIGINT PRIMARY KEY, sub_id VARCHAR(64) NOT NULL, autotranscribe BOOLEAN DEFAULT false)', callback);
    }else if (table == "notificationstate"){
      console.log("table: " + table)
      return pool.query(
        'CREATE TABLE IF NOT EXISTS ' + table + '(ext_id BIGINT PRIMARY KEY, telephony_status VARCHAR(12) NOT NULL, start_time VARCHAR(24) NOT NULL, has_missed_call BOOLEAN DEFAULT false)', callback);
    }else if (table == "inprogressedtranscription"){
      console.log("table: " + table)
      return pool.query(
        'CREATE TABLE IF NOT EXISTS ' + table + '(transcript_id VARCHAR(18) PRIMARY KEY, item_id BIGINT NOT NULL, ext_id BIGINT NOT NULL)', callback);
    }
  },
  createIndex: (query, callback) => {
    return pool.query(query, callback);
  },
  delete_table:(query, callback) => {
    return pool.query(query, callback)
  },
  end_transaction: () => {
    pool.end();
  },
  insert_row: (query, values, callback) => {
    return pool.connect((err, client, done) => {
      const shouldAbort = (err) => {
        if (err) {
          console.error('Error in transaction', err.stack)
          client.query('ROLLBACK', (err) => {
            if (err) {
              console.error('Error rolling back client', err.stack)
            }
            // release the client back to the pool
            done()
          })
        }
        return !!err
      }
      client.query('BEGIN', (err) => {
        if (shouldAbort(err)) return
        client.query(query, values, (err, res) => {
          if (shouldAbort(err)) return
          client.query('COMMIT', (err) => {
            if (err) {
              console.error('Error committing transaction', err.stack)
            }
            done()
          })
        })
      })
    })
  },

  read: (query, callback) => {
    return pool.query(query, callback)
  },
  update: (query, callback) => {
    return pool.query(query, callback)
  },
  insert: (query, params, callback) => {
    return pool.query(query, params, callback)
  },
  remove:(query, callback) => {
    return pool.query(query, callback)
  },
}
