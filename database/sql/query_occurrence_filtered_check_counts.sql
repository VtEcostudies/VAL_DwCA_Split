select count(*) from occurrence_buffered;
select count(*) from occurrence_filtered; --6427823 initial, 6629989 final
select count(*) from occurrence_filtered where "decimalLongitude" IS NULL; --202166