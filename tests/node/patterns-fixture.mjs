// Helpers for the patterns-*.test.mjs files (not a test itself): loads shared/patterns/patterns.js as Node does, and holds
// the fixtures. Every key-shaped fixture is built from pieces at run time (never one realistic literal: push protection
// reads sources). POS and NEG: for each kind, inputs with the texts it must find, and inputs it must ignore.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const P = createRequire(import.meta.url)('../../shared/patterns/patterns.js');

export const H = 'ht' + 'tps://', HP = 'ht' + 'tp://';
export const texts = (s, kind, opts) => P.scan(s, { ...opts, kinds: [kind] }).map((h) => h.text);
export const kindsOf = (s, opts) => P.scan(s, opts).map((h) => h.kind);

export const GH = ['gh', 'p_'].join('') + 'a1B2'.repeat(9);
export const GH_PAT = ['github', '_pat_'].join('') + 'Ab3dEf6gHi9jKl2mNo5pQr_8';
export const AWS = 'AK' + 'IA' + 'ABCDEFGHIJKLMNOP';
export const AWS_SECRET = ['Ab3d', 'Ef6g', 'Hi9j', 'Kl2m', 'No5p', 'Qr8s', 'Tu1v', 'Wx4y', 'Zz7/', 'Q+0K'].join('');
export const SLACK = ['xo', 'xb-'].join('') + '1234567890-1234567890123-' + 'AbCdEfGhIjKlMnOpQrStUvWx';
export const STRIPE = ['sk', '_live_'].join('') + 'AbCd1234'.repeat(3);
export const GOOGLE = ['AI', 'za'].join('') + 'SyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8'.slice(0, 35);
export const JWT = ['eyJ', 'hbGciOiJIUzI1NiJ9'].join('') + '.' + ['eyJ', 'zdWIiOiIxMjM0NTYifQ'].join('') + '.' + 'c2lnbmF0dXJlMTIzNDU2';
export const KEY_BEGIN = '-----BEGIN ' + 'RSA PRIVATE KEY-----', KEY_END = '-----END ' + 'RSA PRIVATE KEY-----';
export const KEY = KEY_BEGIN + '\nMIIEabcdEFGH1234\nijklMNOP5678qrst\n' + KEY_END;
export const CARD = ['4111', '1111', '1111', '1111'];
export const IBAN = ['GB82', 'WEST', '1234', '5698', '7654', '32'];
export const BEARER_TOKEN = 'abcDEF123456.ghiJKL789012_-mno';

/** [input, the texts found] and [input] (nothing found) for each kind: the tables below. */
export const POS = {
  ipv4: [['ip 10.0.0.1.', ['10.0.0.1']], ['0.0.0.0 255.255.255.255', ['0.0.0.0', '255.255.255.255']], ['at 192.168.1.1:8080/x', ['192.168.1.1']],
    ['a=1.2.3.4,b=5.6.7.8', ['1.2.3.4', '5.6.7.8']], ['(8.8.8.8)', ['8.8.8.8']], ['172.16.0.1/12', ['172.16.0.1']]],
  ipv6: [['2001:db8:85a3:0:0:8a2e:370:7334', ['2001:db8:85a3:0:0:8a2e:370:7334']], ['2001:db8::1', ['2001:db8::1']], ['::1', ['::1']],
    ['fe80::1%eth0', ['fe80::1']], ['::ffff:192.168.1.1', ['::ffff:192.168.1.1']], ['1::', ['1::']], ['to [2001:db8::1]:80', ['2001:db8::1']],
    ['at ::1.', ['::1']], ['A:B:C:D:E:F:1:2', ['A:B:C:D:E:F:1:2']], ['64:ff9b::1.2.3.4', ['64:ff9b::1.2.3.4']]],
  mac: [['aa:bb:cc:dd:ee:ff', ['aa:bb:cc:dd:ee:ff']], ['AA-BB-CC-DD-EE-FF', ['AA-BB-CC-DD-EE-FF']], ['mac=00:1A:2b:3C:4d:5E.', ['00:1A:2b:3C:4d:5E']]],
  email: [['bob@example.com', ['bob@example.com']], ['a.b+tag@sub.example.co.uk,', ['a.b+tag@sub.example.co.uk']], ['<x_y-z@my-host.io>', ['x_y-z@my-host.io']],
    ['mailto:me@x.org?subject=1', ['me@x.org']], ['a@b.cc c@d.ee', ['a@b.cc', 'c@d.ee']]],
  url: [['see ' + H + 'example.com/path.', [H + 'example.com/path']], ['(' + H + 'example.com/a_(b)).', [H + 'example.com/a_(b)']],
    ['"' + H + 'x.org/a", \'' + HP + 'y.org\'', [H + 'x.org/a', HP + 'y.org']], [HP + 'localhost:8080/a?b=1;', [HP + 'localhost:8080/a?b=1']],
    ['ftp://files.example.com/pub/x.zip', ['ftp://files.example.com/pub/x.zip']], ['ws://a.io/s wss://b.io/s', ['ws://a.io/s', 'wss://b.io/s']],
    ['file:///etc/hosts', ['file:///etc/hosts']], ['ssh://git@host.io:22/repo.git', ['ssh://git@host.io:22/repo.git']], ['git://host.io/x.git!', ['git://host.io/x.git']],
    [HP + '[::1]:8080/x', [HP + '[::1]:8080/x']], ['[a](' + H + 'x.io/p)', [H + 'x.io/p']], [H.toUpperCase() + 'X.IO/P', [H.toUpperCase() + 'X.IO/P']]],
  uuid: [['123e4567-e89b-12d3-a456-426614174000', ['123e4567-e89b-12d3-a456-426614174000']], ['id=123E4567-E89B-12D3-A456-426614174000;', ['123E4567-E89B-12D3-A456-426614174000']]],
  jwt: [['token ' + JWT + ' end', [JWT]], ['"' + JWT + '"', [JWT]]],
  aws_access_key: [[AWS, [AWS]], ['key=' + AWS.replace('AKIA', 'ASIA') + ';', [AWS.replace('AKIA', 'ASIA')]]],
  aws_secret: [['aws_secret_access_key = "' + AWS_SECRET + '"', [AWS_SECRET]], ['AWS Secret: ' + AWS_SECRET, [AWS_SECRET]], ['aws\tkey\tsecret=' + AWS_SECRET, [AWS_SECRET]]],
  github_token: [[GH, [GH]], [GH.replace('ghp_', 'gho_'), [GH.replace('ghp_', 'gho_')]], [GH.replace('ghp_', 'ghu_') + '.', [GH.replace('ghp_', 'ghu_')]],
    [GH.replace('ghp_', 'ghs_'), [GH.replace('ghp_', 'ghs_')]], [GH.replace('ghp_', 'ghr_'), [GH.replace('ghp_', 'ghr_')]], [GH_PAT, [GH_PAT]], [GH + 'zzzz', [GH + 'zzzz']]],
  slack_token: [[SLACK, [SLACK]], ['t=' + SLACK.replace('xoxb', 'xoxp') + ' x', [SLACK.replace('xoxb', 'xoxp')]], [SLACK.replace('xoxb', 'xoxa'), [SLACK.replace('xoxb', 'xoxa')]],
    [SLACK.replace('xoxb', 'xoxr'), [SLACK.replace('xoxb', 'xoxr')]], [SLACK.replace('xoxb', 'xoxs'), [SLACK.replace('xoxb', 'xoxs')]]],
  stripe_key: [[STRIPE, [STRIPE]], [STRIPE.replace('sk_', 'rk_'), [STRIPE.replace('sk_', 'rk_')]], [STRIPE.replace('sk_', 'pk_'), [STRIPE.replace('sk_', 'pk_')]],
    [STRIPE.replace('_live_', '_test_'), [STRIPE.replace('_live_', '_test_')]]],
  google_api_key: [[GOOGLE, [GOOGLE]], ['key=' + GOOGLE + '&x=1', [GOOGLE]]],
  private_key: [['a\n' + KEY + '\nb', [KEY]], [KEY_BEGIN + '\nMIIEabcd\nno end of it', [KEY_BEGIN + '\nMIIEabcd\nno end of it']],
    ['-----BEGIN ' + 'PRIVATE KEY-----\nAAA\n-----END ' + 'PRIVATE KEY-----', ['-----BEGIN ' + 'PRIVATE KEY-----\nAAA\n-----END ' + 'PRIVATE KEY-----']],
    ['-----BEGIN ' + 'OPENSSH PRIVATE KEY-----\nAAA\n-----END ' + 'OPENSSH PRIVATE KEY-----', ['-----BEGIN ' + 'OPENSSH PRIVATE KEY-----\nAAA\n-----END ' + 'OPENSSH PRIVATE KEY-----']]],
  bearer: [['Authorization: Bearer ' + BEARER_TOKEN, [BEARER_TOKEN]], ['authorization=bearer ' + 'Ab'.repeat(12), ['Ab'.repeat(12)]],
    ['curl -H "Authorization: Bearer ' + BEARER_TOKEN + '"', [BEARER_TOKEN]], ['Bearer ' + 'x1'.repeat(10) + '.', ['x1'.repeat(10)]]],
  basic_auth_url: [['postgres://alice:S3cr3tPw@db.example.com:5432/app', ['alice:S3cr3tPw']], [H + 'user:pw12345@host.io/', ['user:pw12345']],
    ['ftp://bob:p%40ss:word@files.io', ['bob:p%40ss:word']]],
  secret_assignment: [['password = "hunter2hunter2"', ['hunter2hunter2']], ['PASSWORD: s3cretPass1', ['s3cretPass1']], ['api_key=abcd1234efgh', ['abcd1234efgh']],
    ['{"token": "abc123def456"}', ['abc123def456']], ["client_secret: 'zYx987wvuT'", ['zYx987wvuT']], ['DB_PASSWD=Zq9x7Lm2p', ['Zq9x7Lm2p']],
    ['secret => "Abcdefgh1"', ['Abcdefgh1']], ['pwd = "my long pass phrase"', ['my long pass phrase']],
    ['x-api-key: AbCd1234EfGh', ['AbCd1234EfGh']], ['config["password"] = "Zq9x7Lm2pQ"', ['Zq9x7Lm2pQ']], ['key = "a1b2c3d4e5f6"', ['a1b2c3d4e5f6']],
    ['?access_token=abc123def456&x=1', ['abc123def456']]],
  hash: [['a'.repeat(31) + 'b', ['a'.repeat(31) + 'b']], ['sha1 ' + 'ab12'.repeat(10) + '.', ['ab12'.repeat(10)]], ['AB12'.repeat(16), ['AB12'.repeat(16)]],
    ['cd34'.repeat(32), ['cd34'.repeat(32)]], ['ef56'.repeat(8) + ' ' + 'ef56'.repeat(10), ['ef56'.repeat(8), 'ef56'.repeat(10)]]],
  credit_card: [[CARD.join(''), [CARD.join('')]], [CARD.join(' '), [CARD.join(' ')]], [CARD.join('-'), [CARD.join('-')]], ['5555555555554444', ['5555555555554444']],
    ['3782 822463 10005', ['3782 822463 10005']], ['378282246310005', ['378282246310005']], ['card: 6011 1111 1111 1117.', ['6011 1111 1111 1117']]],
  iban: [[IBAN.join(''), [IBAN.join('')]], [IBAN.join(' '), [IBAN.join(' ')]], ['DE89' + '370400440532013000', ['DE89' + '370400440532013000']],
    ['DE89 3704 0044 0532 0130 00 ok', ['DE89 3704 0044 0532 0130 00']], ['NL91' + 'ABNA0417164300', ['NL91' + 'ABNA0417164300']], ['FR14' + '2004101005050001' + '3M02606', ['FR14' + '2004101005050001' + '3M02606']],
    [IBAN.join('') + ' 12 items', [IBAN.join('')]], ['ES91 2100 0418 4502 0005 1332 12', ['ES91 2100 0418 4502 0005 1332']]],
};

export const NEG = {
  ipv4: ['256.1.1.1', '1.2.3', '01.2.3.4', '1.2.3.04', '1.2.3.4.5', '10.0.0.1.2', 'v1.2.3.4', '1.2.3.4.example.com', '999.999.999.999', 'a1.2.3.4', '1.2.3.4a', '1..2.3'],
  ipv6: ['12:30:45', 'aa:bb:cc:dd:ee:ff', '1:2:3:4:5:6:7:8:9', '1::2::3', ':::', '::', 'std::vector', '2001:db8:::1', '12345::1', 'g::1', '1:2:3:4:5:6:7', 'x::1y', 'ab:cd', 'a:1.2.3.4:b'],
  mac: ['aa:bb:cc:dd:ee', 'aa:bb:cc:dd:ee:ff:00', 'aa:bb-cc:dd-ee:ff', 'aaa:bb:cc:dd:ee:ff', 'gg:bb:cc:dd:ee:ff', 'xaa:bb:cc:dd:ee:ff', '00:11:22:33:44:5'],
  email: ['bob@', '@example.com', 'bob@example', 'bob@.com', 'icon@2x.png', 'a@b.c', 'bob@@x.com', 'bob at example dot com', 'logo@3x.webp', 'bob@exa mple.com'],
  url: [HP, HP + '.', 'mailto:a@b.cc', 'x' + HP + 'a.com', 'www.example.com', 'ht' + 'tp:/x.com', HP + '-', 'sftp://x.com'],
  uuid: ['123e4567-e89b-12d3-a456-42661417400', '123e4567e89b12d3a456426614174000', 'g23e4567-e89b-12d3-a456-426614174000', 'x123e4567-e89b-12d3-a456-426614174000', '123e4567-e89b-12d3-a456-4266141740001', '123e4567-e89b-12d3-a456'],
  jwt: ['eyJ', JWT.split('.').slice(0, 2).join('.'), 'x' + JWT, 'eyJabc.def.ghi', 'abc.def.ghi', JWT.replace('eyJ', 'eyK')],
  aws_access_key: [AWS.slice(0, 19), AWS + 'Q', AWS.toLowerCase(), 'XKIA' + AWS.slice(4), 'x' + AWS, 'AK' + 'IA' + 'ABCDEFGHIJKLMNO!'],
  aws_secret: [AWS_SECRET, 'aws key ' + AWS_SECRET, 'secret ' + AWS_SECRET, 'aws\nsecret ' + AWS_SECRET, 'aws secret ' + AWS_SECRET + 'x', 'aws secret ' + AWS_SECRET.slice(1), 'aws secret ' + AWS_SECRET + '=',
    'aws ' + 'x'.repeat(80) + ' secret ' + AWS_SECRET],
  github_token: [GH.slice(0, -1), GH.replace('ghp_', 'ghx_'), 'x' + GH, ['github', '_pat_'].join('') + 'short', 'ghp_', GH.replace('ghp_', 'GHP_')],
  slack_token: [SLACK.replace('xoxb', 'xoxz'), ['xo', 'xb-'].join('') + '12', 'xoxb', 'a' + SLACK, SLACK.replace('xoxb-', 'xoxb_')],
  stripe_key: [STRIPE.slice(0, 20), STRIPE.replace('sk_', 'xk_'), ['pk', '_test_'].join('') + 'AbCd1234'.repeat(3), 'x' + STRIPE, STRIPE.replace('_live_', '_prod_')],
  google_api_key: [GOOGLE.slice(0, -1), GOOGLE + 'x', GOOGLE.replace('AIza', 'AIzb'), 'x' + GOOGLE],
  private_key: ['-----BEGIN ' + 'CERTIFICATE-----\nAAA\n-----END ' + 'CERTIFICATE-----', '-----BEGIN ' + 'PUBLIC KEY-----\nAAA', 'BEGIN ' + 'RSA PRIVATE KEY', KEY_END],
  bearer: ['Bearer of bad news and more', 'Bearer short1', 'Bearer ' + 'a'.repeat(24), 'Authorization: Bearer ${API_TOKEN_VALUE_HERE}', 'Authorization: Bearer YOUR_API_TOKEN_HERE', 'Authorization: Bearer <token>', 'Authorization: Bearer ' + 'x'.repeat(8)],
  basic_auth_url: [H + 'user@host.io', H + 'host.io:8080/path@x', H + 'user:<password>@host.io', H + 'user:${PASS}@host.io', H + 'alice:password@host.io', 'user:pass@host',
    H + 'alice:xxxx@host.io', 'ht' + 'tps:/alice:S3cr3t@host.io'],
  secret_assignment: ['password=abc123', 'password=changeme', 'password=xxxxxxxx', 'password=********', 'password=<password>', 'password=${DB_PASSWORD}', "password: '{{ vault_pw }}'", 'token=null', 'password: true',
    'secret=your_secret_here', 'token = example_token', 'password == "abcdefgh1"', 'monkey: bananabanana', 'token = get_token_value', 'password = os.environ', 'password: "your-password-here"', 'token: false', 'tokenizer = SomethingLong1',
    'secret = undefined', 'key = "background-color"', 'password = $DB_PASSWORD', 'passport: AB12345678', 'password="<enter password>"'],
  hash: ['a'.repeat(30), 'a'.repeat(33), 'a1'.repeat(20) + 'a', 'ab12'.repeat(15) + 'a', 'ab12'.repeat(16) + 'a', 'g' + 'a'.repeat(31), '1'.repeat(32), 'x' + 'a'.repeat(32), 'a'.repeat(32) + 'x', 'ab12'.repeat(30)],
  credit_card: ['4111111111111112', '411111111111', '41111111111111111111', '0000000000000000', '1700000000000', '9111111111111111', '4111 1111 1111 111', '4111-1111-1111-1112', '1234 5678 9012 3456', '4111.1111.1111.1111'],
  iban: [IBAN.join('').replace(/2$/, '1'), 'XX82' + 'WEST12345698765432', IBAN.join('').toLowerCase(), 'GB82' + 'WEST', 'GB82WEST1234569876543', 'GB82' + 'WEST12345698765432' + 'X', 'GB' + '82' + ' ' + 'WE'],
};
