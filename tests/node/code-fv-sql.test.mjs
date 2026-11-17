// Covers: code/js/fv-sql.js
// The Formatted view, SQL. Run with: node --test tests/node/code-fv-sql.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatForView } from '../../code/js/formatview.js';

const sql = (text) => { const r = formatForView(text, 'text', 'a.sql'); assert.equal(r.ok, true, JSON.stringify(r)); return r.text; };
const lines = (...l) => l.join('\n');

test('sql: clause keywords start a line and a select list has one column per line, with the case of every word kept', () => {
  assert.equal(sql("select a, b, c from t where x = 1 and y = 'z' group by a, b having count(*) > 1 order by a desc limit 10 offset 20"),
    lines('select', '  a,', '  b,', '  c', 'from t', "where x = 1 and y = 'z'", 'group by a, b', 'having count(*) > 1', 'order by a desc', 'limit 10', 'offset 20'));
  assert.equal(sql('SeLeCt DISTINCT a,b FrOm t WHERE a>1'), lines('SeLeCt DISTINCT', '  a,', '  b', 'FrOm t', 'WHERE a>1'));
  assert.equal(sql('SELECT TOP 5 name FROM t'), lines('SELECT TOP 5', '  name', 'FROM t'));
  assert.equal(sql('select *\n\n\n   from   t\n\twhere\nx=1  ;'), lines('select', '  *', 'from t', 'where x=1;'));
  assert.equal(sql(sql('select a,b from t where x=1 order by a')), sql('select a,b from t where x=1 order by a'), 'formatting twice changes nothing');
});

test('sql: every JOIN variant starts a line and its ON goes on the next', () => {
  const src = 'SELECT 1 FROM a INNER JOIN b ON a.id=b.id AND b.x=1 LEFT OUTER JOIN c ON c.id=a.id RIGHT JOIN d ON d.id=a.id FULL OUTER JOIN e ON e.id=a.id CROSS JOIN f NATURAL JOIN g JOIN h USING (id) LEFT JOIN i ON i.a = h.a WHERE 1=1';
  assert.equal(sql(src), lines('SELECT', '  1', 'FROM a', 'INNER JOIN b', '  ON a.id=b.id AND b.x=1', 'LEFT OUTER JOIN c', '  ON c.id=a.id', 'RIGHT JOIN d', '  ON d.id=a.id', 'FULL OUTER JOIN e', '  ON e.id=a.id',
    'CROSS JOIN f', 'NATURAL JOIN g', 'JOIN h USING (id)', 'LEFT JOIN i', '  ON i.a = h.a', 'WHERE 1=1'));
  assert.equal(sql('select left(name, 3), right(x, 1) from t'), lines('select', '  left(name, 3),', '  right(x, 1)', 'from t'), 'LEFT( is a function, not a join');
});

test('sql: UNION [ALL], INTERSECT and EXCEPT sit on their own line', () => {
  assert.equal(sql('SELECT a FROM t UNION ALL SELECT b FROM u UNION SELECT c FROM v INTERSECT SELECT d FROM w EXCEPT SELECT e FROM x'),
    lines('SELECT', '  a', 'FROM t', 'UNION ALL', 'SELECT', '  b', 'FROM u', 'UNION', 'SELECT', '  c', 'FROM v', 'INTERSECT', 'SELECT', '  d', 'FROM w', 'EXCEPT', 'SELECT', '  e', 'FROM x'));
});

test('sql: subqueries in parentheses are indented, other parentheses stay on the line', () => {
  assert.equal(sql('select a, (select max(x) from t2 where t2.a = t1.a) as m from t1 where id in (select id from u where z > 1) and k in (1,2,3) and f(a, b) > 1'),
    lines('select', '  a,', '  (', '    select', '      max(x)', '    from t2', '    where t2.a = t1.a', '  ) as m', 'from t1', 'where id in (', '  select', '    id', '  from u', '  where z > 1', ') and k in (1, 2, 3) and f(a, b) > 1'));
  assert.equal(sql('select * from (select a from t) x join (select b from u) y on x.a=y.b'),
    lines('select', '  *', 'from (', '  select', '    a', '  from t', ') x', 'join (', '  select', '    b', '  from u', ') y', '  on x.a=y.b'));
  assert.equal(sql('select count(distinct a), sum(b) over (partition by c order by d) from t'), lines('select', '  count(distinct a),', '  sum(b) over (partition by c order by d)', 'from t'), 'ORDER BY inside OVER ( ) does not break');
});

test('sql: INSERT, UPDATE, DELETE and SET and VALUES lists', () => {
  assert.equal(sql("insert into t (a,b) values (1,'x'),(2,'y');update t set a=1,b=b+1 where id=3;delete from t where id=1"),
    lines('insert into t (a, b)', 'values', "  (1, 'x'),", "  (2, 'y');", '', 'update t', 'set', '  a=1,', '  b=b+1', 'where id=3;', '', 'delete from t', 'where id=1'));
  assert.equal(sql('INSERT INTO t SELECT a FROM u'), lines('INSERT INTO t', 'SELECT', '  a', 'FROM u'));
  assert.equal(sql('INSERT INTO t (a) VALUES (1) ON CONFLICT (a) DO UPDATE SET a = 2'), lines('INSERT INTO t (a)', 'VALUES', '  (1) ON CONFLICT (a) DO UPDATE SET a = 2'));
});

test('sql: CREATE, ALTER, DROP and WITH', () => {
  assert.equal(sql("create table t (id int primary key, name varchar(20) not null default 'x', foreign key (id) references u (id) on delete cascade);create unique index i on t (id, name);alter table t add column c int;drop table if exists t"),
    lines('create table t (', '  id int primary key,', "  name varchar(20) not null default 'x',", '  foreign key (id) references u (id) on delete cascade', ');', '', 'create unique index i on t (id, name);', '',
      'alter table t add column c int;', '', 'drop table if exists t'));
  assert.equal(sql('CREATE VIEW v AS SELECT a FROM t'), lines('CREATE VIEW v AS', 'SELECT', '  a', 'FROM t'));
  assert.equal(sql('with x as (select 1), y as (select 2) select * from x, y'),
    lines('with x as (', '  select', '    1', '),', 'y as (', '  select', '    2', ')', 'select', '  *', 'from x, y'));
  assert.equal(sql('WITH RECURSIVE r(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM r WHERE n<3) SELECT n FROM r'),
    lines('WITH RECURSIVE r(n) AS (', '  SELECT', '    1', '  UNION ALL', '  SELECT', '    n+1', '  FROM r', '  WHERE n<3', ')', 'SELECT', '  n', 'FROM r'));
});

test('sql: strings, quoted names, comments and dollar quotes are left alone', () => {
  const src = 'select \'a; from  where -- not a comment\', "from  x", `select`, \'it\'\'s ; fine\' /* from where ; */ from t -- trailing ; select\nwhere a=\'\' and b=$$ x ; from $$ ; select 1';
  assert.equal(sql(src), lines('select', "  'a; from  where -- not a comment',", '  "from  x",', '  `select`,', "  'it''s ; fine' /* from where ; */", 'from t -- trailing ; select', "where a='' and b=$$ x ; from $$;", '', 'select', '  1'));
  assert.equal(sql('-- only a comment'), '-- only a comment');
  assert.equal(sql('/* one */\nselect 1 /* two */ from t'), lines('/* one */', 'select', '  1 /* two */', 'from t'));
  assert.equal(sql('select a, -- the a\n b from t'), lines('select', '  a, -- the a', '  b', 'from t'));
  assert.equal(sql('CREATE FUNCTION f() RETURNS int AS $body$ BEGIN SELECT 1; RETURN 2; END; $body$ LANGUAGE sql; SELECT f()'),
    lines('CREATE FUNCTION f() RETURNS int AS $body$ BEGIN SELECT 1; RETURN 2; END; $body$ LANGUAGE sql;', '', 'SELECT', '  f()'));
  assert.equal(sql('select a.b, [dbo].[t].c, x::int, :p, @v, $1, 1.5e3, a<>b from t'), lines('select', '  a.b,', '  [dbo].[t].c,', '  x::int,', '  :p,', '  @v,', '  $1,', '  1.5e3,', '  a<>b', 'from t'));
});

test('sql: statements are separated by a blank line, with no blank line at the end', () => {
  assert.equal(sql('select 1;select 2;;select 3;'), lines('select', '  1;', '', 'select', '  2;', '', ';', '', 'select', '  3;'));
  assert.equal(sql('begin; update t set a=1; commit'), lines('begin;', '', 'update t', 'set', '  a=1;', '', 'commit'));
});

test('sql: odd input does not fail: unbalanced parentheses, an unterminated string or comment, no SQL at all', () => {
  for (const src of ['select (((1', 'select )))1', "select 'abc", 'select /* abc', 'select "abc', '$$ abc', '(((', ')', ',,,', 'hello world', '', ' ']) assert.equal(formatForView(src, 'text', 'a.sql').ok, true, src);
  assert.equal(sql("select 'abc"), lines('select', "  'abc"));
  assert.equal(sql('select 1 )) from t'), lines('select', '  1))', 'from t'));
  assert.equal(sql('hello world'), 'hello world');
  assert.equal(sql(''), '');
});

test('sql: a 1 MB script is formatted in under 2 seconds', () => {
  const stmt = "select a,b from t where x=1 and y in (select z from u) order by a;insert into t (a,b) values (1,'x;y');";
  const src = stmt.repeat(Math.ceil(1000000 / stmt.length));
  const t0 = performance.now();
  const r = formatForView(src, 'text', 'big.sql');
  assert.ok(performance.now() - t0 < 2000, 'took ' + (performance.now() - t0));
  assert.equal(r.ok, true);
});
