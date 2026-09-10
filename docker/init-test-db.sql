-- Runs once, on first boot of the Postgres container.
-- pytest points at this database so tests never touch dev data.
CREATE DATABASE studentwise_test OWNER studentwise;
