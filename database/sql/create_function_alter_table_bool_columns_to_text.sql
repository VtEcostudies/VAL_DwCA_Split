CREATE OR REPLACE FUNCTION alter_table_bools(tabl text)
  RETURNS SETOF text AS
$func$
DECLARE
	elem text;
BEGIN
   FOR elem IN
	select column_name from information_schema.columns
	where (
		table_name=tabl and data_type='boolean'
		and column_name NOT LIKE 'has%'
	) --limit 10 --this was necessary b/c on big table this consumes > 60GB disk, causing 'no space on device' errors
	-- but now (see below) we copy, truncate, fix, re-insert data to make it faster
	LOOP
		EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE TEXT', tabl, elem);
		RETURN NEXT elem;
	END LOOP;
END
$func$
LANGUAGE plpgsql;

-- If a table has data, these take dozens of minutes to run, and there are hundreds of columns to convert.
-- See 'alter_buffered_verbatim_bool_columns_to_text.sql' to handle that properly.
--select * from alter_table_bools('occurrence_filtered')
--select * from alter_table_bools('occurrence_buffered')
--select * from alter_table_bools('verbatim_filtered')
--select * from alter_table_bools('verbatim_buffered')