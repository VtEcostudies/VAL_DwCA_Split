--DROP TABLE IF EXISTS verbatim_filtered;
/*
NOTE: for R to load this file and use it, we cannot have more than one SQL statement.
*/
SELECT verbatim_buffered.* 
INTO verbatim_filtered
FROM verbatim_buffered
INNER JOIN occurrence_filtered ON verbatim_buffered."gbifID" = occurrence_filtered."gbifID";
--SELECT COUNT("gbifID") FROM verbatim_filtered;
--2022-05-16: 7,645,807, 7,817,395
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