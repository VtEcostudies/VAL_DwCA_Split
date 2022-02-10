--fix buffered table columns from bool to text but copy and truncate so it doesn't take forever
BEGIN TRANSACTION;
DROP TABLE IF EXISTS occ_buff_temp;
CREATE TABLE occ_buff_temp AS SELECT * FROM occurrence_buffered;
TRUNCATE TABLE occurrence_buffered;
SELECT alter_table_bools('occurrence_buffered');
INSERT INTO occurrence_buffered SELECT * FROM occ_buff_temp;
DROP TABLE occ_buff_temp;
END TRANSACTION;