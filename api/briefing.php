<?php
// News briefing for the calculator: loading-screen jokes, the President's latest
// public location, and any publicly announced White House visitor.
// Results are cached on the server for 3 hours, so Claude is only asked a few
// times a day no matter how many people visit.
//
// SETUP: put your Anthropic API key in a file OUTSIDE public_html:
//   /home/YOUR_CPANEL_USERNAME/presidential-air-config.php
// containing:
//   <?php return ['anthropic_api_key' => 'sk-ant-...'];
// Never put the key in this file or anywhere in the GitHub repository.

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=600');
ignore_user_abort(true);   // keep refreshing the cache even if the visitor's browser gives up
@set_time_limit(90);

$fallback = ['lines' => [], 'whereabouts' => null, 'visitor' => null, 'source' => 'fallback'];

$home = preg_match('#^(/home\d*/[^/]+)#', __DIR__, $m) ? $m[1] : dirname(isset($_SERVER['DOCUMENT_ROOT']) ? $_SERVER['DOCUMENT_ROOT'] : __DIR__);
$configFile = $home . '/presidential-air-config.php';
$cacheFile  = $home . '/presidential-air-cache.json';
$ttl = 3 * 3600;

function send_stale_or($cacheFile, $fallback) {
    if (is_readable($cacheFile)) { readfile($cacheFile); } else { echo json_encode($fallback); }
    exit;
}

// 1. Fresh cache? Serve it.
if (is_readable($cacheFile) && (time() - filemtime($cacheFile)) < $ttl) {
    readfile($cacheFile);
    exit;
}

// 2. No key? Fall back quietly.
$config = is_readable($configFile) ? include $configFile : [];
$key = (is_array($config) && !empty($config['anthropic_api_key'])) ? $config['anthropic_api_key'] : getenv('ANTHROPIC_API_KEY');
if (!$key) { echo json_encode($fallback); exit; }

// 3. Only one visitor refreshes at a time; everyone else gets the stale copy.
$lock = @fopen($cacheFile . '.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) { send_stale_or($cacheFile, $fallback); }

$today = gmdate('Y-m-d');
$prompt = <<<PROMPT
Today is {$today}. Use web search to check this week's top news involving the President of the United States.

Then write 8 short loading-screen lines (max 90 characters each) for a satirical website that "calculates" the odds a visitor has breathed the same air as the President.

Style: a playful, affectionate parody of his well-known speaking style (superlatives, "tremendous", "many people are saying"). Each line should tie a real, publicly reported topic from this week's news to air, wind, breath, lungs, or weather.

Rules:
- Never present invented words as direct quotes from him or anyone else. Use no quotation marks.
- Make no factual claims beyond what the news actually reports.
- Nothing cruel, crude, or about anyone's health. Keep it light enough for any visitor.

Also find where the President is today, or failing that his most recently reported location, using his public schedule or news reports (for example, the city or venue of his latest event, or where Air Force One last landed). Only report a location the sources state clearly, and give the date it applies to.

Also check whether the President is publicly hosting or meeting a notable visitor at the White House today (for example, a foreign leader, a sports team, or a well-known public figure listed on his public schedule). Only include a meeting that is publicly announced. Give the visitor's name or title as it would appear in a headline, e.g. "the Prime Minister of Japan" or "Elon Musk".

Respond with only JSON, no preamble or code fences:
{"lines": ["..."], "whereabouts": {"name": "city or venue", "lat": 0, "lng": 0, "asOf": "YYYY-MM-DD"}, "visitor": "name or null"}
Use "whereabouts": null if unclear, and "visitor": null if there is no publicly announced White House meeting today.
PROMPT;

$body = json_encode([
    'model' => 'claude-haiku-4-5-20251001',
    'max_tokens' => 1500,
    'tools' => [['type' => 'web_search_20250305', 'name' => 'web_search', 'max_uses' => 5]],
    'messages' => [['role' => 'user', 'content' => $prompt]],
]);

$ch = curl_init('https://api.anthropic.com/v1/messages');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 75,
    CURLOPT_HTTPHEADER => [
        'content-type: application/json',
        'x-api-key: ' . $key,
        'anthropic-version: 2023-06-01',
    ],
    CURLOPT_POSTFIELDS => $body,
]);
$raw = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($raw === false || $status !== 200) { error_log("briefing: Anthropic API status $status"); send_stale_or($cacheFile, $fallback); }

$data = json_decode($raw, true);
$text = '';
foreach ((isset($data['content']) ? $data['content'] : []) as $block) {
    if (isset($block['type']) && $block['type'] === 'text') { $text .= $block['text'] . "\n"; }
}
$text = str_replace(['```json', '```'], '', $text);
if (!preg_match('/\{[\s\S]*\}/', $text, $mm)) { send_stale_or($cacheFile, $fallback); }
$parsed = json_decode($mm[0], true);
if (!is_array($parsed)) { send_stale_or($cacheFile, $fallback); }

$quotes = ['"', "\u{201C}", "\u{201D}"];

$lines = [];
if (isset($parsed['lines']) && is_array($parsed['lines'])) {
    foreach ($parsed['lines'] as $l) {
        if (is_string($l) && strlen($l) > 0 && mb_strlen($l) <= 140) { $lines[] = trim(str_replace($quotes, '', $l)); }
        if (count($lines) >= 10) break;
    }
}

$whereabouts = null;
$w = isset($parsed['whereabouts']) ? $parsed['whereabouts'] : null;
if (is_array($w) && isset($w['name'], $w['lat'], $w['lng']) && is_string($w['name'])
    && is_numeric($w['lat']) && is_numeric($w['lng'])
    && abs($w['lat']) <= 90 && abs($w['lng']) <= 180 && !($w['lat'] == 0 && $w['lng'] == 0)) {
    $whereabouts = [
        'name' => mb_substr($w['name'], 0, 80),
        'lat' => (float) $w['lat'],
        'lng' => (float) $w['lng'],
        'asOf' => (isset($w['asOf']) && is_string($w['asOf'])) ? $w['asOf'] : $today,
    ];
}

$visitor = null;
if (isset($parsed['visitor']) && is_string($parsed['visitor'])) {
    $v = trim(str_replace($quotes, '', $parsed['visitor']));
    if ($v !== '' && strtolower($v) !== 'null') { $visitor = mb_substr($v, 0, 80); }
}

$out = json_encode(['lines' => $lines, 'whereabouts' => $whereabouts, 'visitor' => $visitor, 'source' => 'news', 'generated' => $today]);
$tmp = $cacheFile . '.tmp';
if (@file_put_contents($tmp, $out) !== false) { @rename($tmp, $cacheFile); }
flock($lock, LOCK_UN);
echo $out;
