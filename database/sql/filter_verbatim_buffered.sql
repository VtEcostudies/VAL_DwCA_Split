BEGIN TRANSACTION;
DROP TABLE IF EXISTS verbatim_filtered;
select verbatim_buffered.* 
into verbatim_filtered
from verbatim_buffered
inner join occurrence_filtered on verbatim_buffered."gbifID" = occurrence_filtered."gbifID";
END TRANSACTION;
--SELECT COUNT("gbifID") FROM verbatim_filtered; --6,458,295
/*
NOTE: with data load on 2022-01-25 verbatim included data with rows that cause errors in ST_GEOMFROMTEXT.
One 'new' dataprovider supplied non-conforming lat/lon using N and W instead of +/-. GBIF of course fixed
those errors in the processed output, which we have in occurrence_filtered. Querying with a join on gbifID
above is the better way to do that, anyway.
*/
/*
inner join vt_boundary_river_lake on 
	ST_WITHIN(
		ST_GEOMFROMTEXT('POINT(' || "decimalLongitude" || ' ' ||  "decimalLatitude" || ')', 4326),
		vt_boundary_river_lake.geometry
	);
*/