CREATE OR REPLACE FUNCTION alter_table_bools(tabl text)
  RETURNS SETOF text AS
$func$
DECLARE
	--tabl text:='occurrence_filtered';
	--tabl text:='verbatim_filtered';
	elem text;
BEGIN
   FOR elem IN
	select column_name from information_schema.columns
	where (
		table_name=tabl and data_type='boolean'
		and column_name NOT LIKE 'has%'
	) limit 10 --this necessary b/c on big table this consumes > 60GB disk, causing 'no space on device' errors
	LOOP
		EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE TEXT', tabl, elem);
		RETURN NEXT elem;
	END LOOP;
END
$func$
LANGUAGE plpgsql;

--select * from alter_table_bools('occurrence_filtered')
--select * from alter_table_bools('verbatim_filtered')