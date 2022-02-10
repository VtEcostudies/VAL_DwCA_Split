/*
This is a half-baked effort on a half-baked idea. I saved it in case it has legs.
*/
CREATE OR REPLACE FUNCTION extinct_obs(yr_cut text)
  RETURNS SETOF text AS
$func$
DECLARE
	elem text;
BEGIN
drop table if exists before_occs; drop table if exists after_occs;
select "scientificName","gbifID","eventDate" into before_occs from occurrence_filtered 
where "eventDate" < yr_cut and "kingdom"='Animalia';
select "scientificName","gbifID","eventDate" into after_occs from occurrence_filtered 
where "eventDate" > yr_cut and "kingdom"='Animalia';
/*
   FOR elem IN
	select distinct "class" from occurrence_filtered where "phylum"='Chordata';
	where (
		table_name=tabl and data_type='boolean'
		and column_name NOT LIKE 'has%'
	)
	LOOP
		RETURN NEXT elem;
	END LOOP;
*/
END
$func$
LANGUAGE plpgsql;
