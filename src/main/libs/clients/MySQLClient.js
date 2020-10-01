'use strict';
import mysql from 'mysql';
import { AntaresCore } from '../AntaresCore';

export class MySQLClient extends AntaresCore {
   /**
    * @memberof MySQLClient
    */
   async connect () {
      if (!this._poolSize)
         this._connection = mysql.createConnection(this._params);
      else
         this._connection = mysql.createPool({ ...this._params, connectionLimit: this._poolSize });
   }

   /**
    * @memberof MySQLClient
    */
   destroy () {
      this._connection.end();
   }

   /**
    * Executes an USE query
    *
    * @param {String} schema
    * @memberof MySQLClient
    */
   use (schema) {
      return this.raw(`USE \`${schema}\``);
   }

   /**
    * @returns {Array.<Object>} databases scructure
    * @memberof MySQLClient
    */
   async getStructure () {
      const { rows: databases } = await this.raw('SHOW DATABASES');

      const { rows: tables } = await this
         .select('*')
         .schema('information_schema')
         .from('TABLES')
         .orderBy({ TABLE_SCHEMA: 'ASC', TABLE_NAME: 'ASC' })
         .run();

      return databases.map(db => {
         return {
            name: db.Database,
            tables: tables.filter(table => table.TABLE_SCHEMA === db.Database)// TODO: remap tables objects
         };
      });
   }

   /**
    * SHOW COLLATION
    *
    * @returns {Array.<Object>} collations list
    * @memberof MySQLClient
    */
   async getCollations () {
      const results = await this.raw('SHOW COLLATION');

      return results.rows.map(row => {
         return {
            charset: row.Charset,
            collation: row.Collation,
            compiled: row.Compiled.includes('Yes'),
            default: row.Default.includes('Yes'),
            id: row.Id,
            sortLen: row.Sortlen
         };
      });
   }

   /**
    * SHOW VARIABLES
    *
    * @returns {Array.<Object>} variables list
    * @memberof MySQLClient
    */
   async getVariables () {
      const sql = 'SHOW VARIABLES';
      const results = await this.raw(sql);

      return results.rows.map(row => {
         return {
            name: row.Variable_name,
            value: row.Value
         };
      });
   }

   /**
    * @returns {String} SQL string
    * @memberof MySQLClient
    */
   getSQL () {
      // SELECT
      const selectArray = this._query.select.reduce(this._reducer, []);
      let selectRaw = '';

      if (selectArray.length)
         selectRaw = selectArray.length ? `SELECT ${selectArray.join(', ')} ` : 'SELECT * ';

      // FROM
      let fromRaw = '';

      if (!this._query.update.length && !Object.keys(this._query.insert).length && !!this._query.from)
         fromRaw = 'FROM';
      else if (Object.keys(this._query.insert).length)
         fromRaw = 'INTO';

      fromRaw += this._query.from ? ` ${this._query.schema ? `\`${this._query.schema}\`.` : ''}\`${this._query.from}\` ` : '';

      // WHERE
      const whereArray = this._query.where.reduce(this._reducer, []);
      const whereRaw = whereArray.length ? `WHERE ${whereArray.join(' AND ')} ` : '';

      // UPDATE
      const updateArray = this._query.update.reduce(this._reducer, []);
      const updateRaw = updateArray.length ? `SET ${updateArray.join(', ')} ` : '';

      // INSERT
      let insertRaw = '';

      if (Object.keys(this._query.insert).length) {
         const fieldsList = [];
         const valueList = [];
         const fields = this._query.insert;

         for (const key in fields) {
            if (fields[key] === null) continue;
            fieldsList.push(key);
            valueList.push(fields[key]);
         }

         insertRaw = `(${fieldsList.join(', ')}) VALUES (${valueList.join(', ')}) `;
      }

      // GROUP BY
      const groupByArray = this._query.groupBy.reduce(this._reducer, []);
      const groupByRaw = groupByArray.length ? `GROUP BY ${groupByArray.join(', ')} ` : '';

      // ORDER BY
      const orderByArray = this._query.orderBy.reduce(this._reducer, []);
      const orderByRaw = orderByArray.length ? `ORDER BY ${orderByArray.join(', ')} ` : '';

      // LIMIT
      const limitRaw = this._query.limit.length ? `LIMIT ${this._query.limit.join(', ')} ` : '';

      return `${selectRaw}${updateRaw ? 'UPDATE' : ''}${insertRaw ? 'INSERT ' : ''}${this._query.delete ? 'DELETE ' : ''}${fromRaw}${updateRaw}${whereRaw}${groupByRaw}${orderByRaw}${limitRaw}${insertRaw}`;
   }

   /**
    * @param {string} sql raw SQL query
    * @param {boolean} [nest]
    * @returns {Promise}
    * @memberof MySQLClient
    */
   async raw (sql, nest) {
      const nestTables = nest ? '.' : false;
      const resultsArr = [];
      const queries = sql.split(';');

      if (process.env.NODE_ENV === 'development') this._logger(sql);// TODO: replace BLOB content with a placeholder

      for (const query of queries) {
         if (!query) continue;

         const { rows, report, fields } = await new Promise((resolve, reject) => {
            this._connection.query({ sql: query, nestTables }, (err, response, fields) => {
               if (err)
                  reject(err);
               else {
                  resolve({
                     rows: Array.isArray(response) ? response : false,
                     report: !Array.isArray(response) ? response : false,
                     fields
                  });
               }
            });
         });
         resultsArr.push({ rows, report, fields });
      }

      return resultsArr.length === 1 ? resultsArr[0] : resultsArr;
   }
}