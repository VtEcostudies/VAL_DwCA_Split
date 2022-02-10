--fix buffered table columns from bool to text but copy and truncate so it doesn't take forever
BEGIN TRANSACTION;
DROP TABLE IF EXISTS verb_buff_temp;
CREATE TABLE verb_buff_temp AS SELECT * FROM verbatim_buffered;
TRUNCATE TABLE verbatim_buffered;
SELECT alter_table_bools('verbatim_buffered');
INSERT INTO verbatim_buffered SELECT * FROM verb_buff_temp;
SELECT * FROM verbatim_buffered limit 0;
DROP TABLE verb_buff_temp;
END TRANSACTION;

