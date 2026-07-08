<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Cache-Control: no-cache, no-store, must-revalidate');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

class Storage {
    private $db = null;
    private $jsonFile;
    private $useSQLite = false;

    public function __construct() {
        $this->jsonFile = __DIR__ . '/database.json';
        if (class_exists('SQLite3') || extension_loaded('pdo_sqlite')) {
            try {
                $dbPath = __DIR__ . '/spalatorie.db';
                $this->db = new PDO('sqlite:' . $dbPath);
                $this->db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                $this->db->exec("CREATE TABLE IF NOT EXISTS app_data (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    data TEXT NOT NULL,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )");
                $this->useSQLite = true;
            } catch (Exception $e) {
                $this->useSQLite = false;
            }
        }
    }

    public function save($jsonString) {
        $success = false;
        $errors = [];

        if ($this->useSQLite && $this->db) {
            try {
                $stmt = $this->db->prepare("INSERT OR REPLACE INTO app_data (id, data, updated_at) VALUES (1, :data, datetime('now'))");
                $stmt->execute([':data' => $jsonString]);
                $success = true;
            } catch (Exception $e) {
                $errors[] = 'SQLite: ' . $e->getMessage();
            }
        }

        $dirPath = dirname($this->jsonFile);
        if (is_writable($dirPath)) {
            $result = @file_put_contents($this->jsonFile, $jsonString, LOCK_EX);
            if ($result !== false) {
                $success = true;
            } else {
                $errors[] = 'JSON file: write failed';
            }
        } else {
            $errors[] = 'JSON file: directory not writable';
        }

        return ['success' => $success, 'errors' => $errors, 'engine' => $this->useSQLite ? 'SQLite' : 'JSON'];
    }

    public function load() {
        if ($this->useSQLite && $this->db) {
            try {
                $stmt = $this->db->query("SELECT data FROM app_data WHERE id = 1");
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($row && !empty($row['data'])) {
                    return $row['data'];
                }
            } catch (Exception $e) { }
        }

        if (file_exists($this->jsonFile)) {
            $data = @file_get_contents($this->jsonFile);
            if ($data !== false && !empty($data)) {
                return $data;
            }
        }
        return null;
    }
}

$storage = new Storage();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $inputJSON = file_get_contents('php://input');
    $input = json_decode($inputJSON, true);

    // Garda critică anti-ștergere bază de date la payload-uri corupte
    if ($input !== null && isset($input['equipments']) && is_array($input['equipments'])) {
        $existingJSON = $storage->load();
        $existing = $existingJSON ? json_decode($existingJSON, true) : null;
        
        if ($existing && isset($existing['equipments'])) {
            // Sincronizare / Merge inteligent asincron pe baza ID-urilor unice
            foreach ($input['equipments'] as $inEqIndex => $inEq) {
                foreach ($existing['equipments'] as $exEqIndex => $exEq) {
                    if ($inEq['id'] === $exEq['id']) {
                        $mergedBookings = [];
                        $bookingIds = [];
                        foreach ($inEq['bookings'] as $inB) {
                            $mergedBookings[] = $inB;
                            $bookingIds[] = $inB['id'];
                        }
                        foreach ($exEq['bookings'] as $exB) {
                            if (!in_array($exB['id'], $bookingIds)) {
                                $mergedBookings[] = $exB;
                            }
                        }
                        $input['equipments'][$inEqIndex]['bookings'] = $mergedBookings;
                    }
                }
            }
            
            if (isset($existing['chatMessages']) && isset($input['chatMessages'])) {
                $mergedChat = []; $chatIds = [];
                foreach ($input['chatMessages'] as $msg) { $mergedChat[] = $msg; $chatIds[] = $msg['id']; }
                foreach ($existing['chatMessages'] as $msg) { if (!in_array($msg['id'], $chatIds)) $mergedChat[] = $msg; }
                usort($mergedChat, function($a, $b) { return $a['timestamp'] - $b['timestamp']; });
                $input['chatMessages'] = $mergedChat;
            }
            
            if (isset($existing['history']) && isset($input['history'])) {
                $mergedHistory = []; $histIds = [];
                foreach ($input['history'] as $h) { $mergedHistory[] = $h; $histIds[] = $h['id']; }
                foreach ($existing['history'] as $h) { if (!in_array($h['id'], $histIds)) $mergedHistory[] = $h; }
                $input['history'] = $mergedHistory;
            }

            if (isset($existing['users']) && isset($input['users'])) {
                $mergedUsers = []; $userNames = [];
                foreach ($input['users'] as $u) { $mergedUsers[] = $u; $userNames[] = $u['name']; }
                foreach ($existing['users'] as $u) { if (!in_array($u['name'], $userNames)) $mergedUsers[] = $u; }
                $input['users'] = $mergedUsers;
            }
            
            $inputJSON = json_encode($input);
        }

        $result = $storage->save($inputJSON);
        if ($result['success']) {
            echo json_encode(['status' => 'success', 'engine' => $result['engine']]);
        } else {
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'Save failed']);
        }
    } else {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Invalid JSON structure']);
    }
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $data = $storage->load();
    if ($data !== null && !empty($data) && $data !== '{"equipments":null}') {
        echo $data;
    } else {
        http_response_code(503);
        echo json_encode(['status' => 'error', 'message' => 'Database uninitialized or empty.']);
    }
    exit;
}

http_response_code(405);
echo json_encode(['status' => 'error', 'message' => 'Method Not Allowed']);
?>