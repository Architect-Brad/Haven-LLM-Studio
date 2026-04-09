/*
 * Haven LLM Studio Plasma 6 Widget
 * Shows server status, model info, and quick inference from the desktop
 *
 * Installation:
 *   mkdir -p ~/.local/share/plasma/plasmoids/com.havenllm.studio
 *   cp -r contents metadata.json ~/.local/share/plasma/plasmoids/com.havenllm.studio/
 */

// contents/ui/main.qml
import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Layouts 1.15
import org.kde.plasma.plasmoid 2.0
import org.kde.plasma.core 2.0 as PlasmaCore
import org.kde.plasma.components 3.0 as PlasmaComponents
import org.kde.kirigami 2.20 as Kirigami

PlasmoidItem {
    id: root

    // Configuration
    property string serverUrl: "http://127.0.0.1:1234"
    property bool serverOnline: false
    property string currentModel: ""
    property double tokensPerSecond: 0
    property int cpuUsage: 0

    // Compact representation (panel widget)
    switchHeight: 32
    switchWidth: 120

    compactRepresentation: Item {
        implicitWidth: compactLayout.implicitWidth
        implicitHeight: compactLayout.implicitHeight

        RowLayout {
            id: compactLayout
            spacing: 8

            // Status indicator
            Rectangle {
                width: 12
                height: 12
                radius: 6
                color: root.serverOnline ? "#3fb950" : "#f85149"

                Behavior on color {
                    ColorAnimation { duration: 300 }
                }
            }

            // Server status text
            PlasmaComponents.Label {
                text: root.serverOnline ? "Haven: Online" : "Haven: Offline"
                font.pixelSize: 11
            }

            // Tokens/sec (if running)
            PlasmaComponents.Label {
                text: root.tokensPerSecond > 0 ? `${root.tokensPerSecond.toFixed(1)} t/s` : ""
                font.pixelSize: 11
                color: "#58a6ff"
                visible: root.tokensPerSecond > 0
            }
        }

        // Click to open full representation
        MouseArea {
            anchors.fill: parent
            onClicked: plasmoid.expanded = true
        }
    }

    // Full representation (popup)
    fullRepresentation: Item {
        implicitWidth: 360
        implicitHeight: 280

        ColumnLayout {
            anchors.fill: parent
            spacing: 12

            // Header
            RowLayout {
                spacing: 8

                Rectangle {
                    width: 16
                    height: 16
                    radius: 8
                    color: root.serverOnline ? "#3fb950" : "#f85149"
                }

                PlasmaComponents.Label {
                    text: "Haven LLM Studio"
                    font.pixelSize: 16
                    font.bold: true
                }

                Item { Layout.fillWidth: true }

                PlasmaComponents.Button {
                    text: "↻"
                    onClicked: refreshStatus()
                    flat: true
                }
            }

            // Server info
            GridLayout {
                columns: 2
                columnSpacing: 16
                rowSpacing: 8

                PlasmaComponents.Label {
                    text: "Status:"
                    font.bold: true
                }
                PlasmaComponents.Label {
                    text: root.serverOnline ? "Running" : "Stopped"
                    color: root.serverOnline ? "#3fb950" : "#f85149"
                }

                PlasmaComponents.Label {
                    text: "Model:"
                    font.bold: true
                }
                PlasmaComponents.Label {
                    text: root.currentModel || "None loaded"
                    elide: Text.ElideMiddle
                    maximumLineCount: 1
                }

                PlasmaComponents.Label {
                    text: "Speed:"
                    font.bold: true
                }
                PlasmaComponents.Label {
                    text: root.tokensPerSecond > 0 ? `${root.tokensPerSecond.toFixed(1)} tokens/sec` : "—"
                }

                PlasmaComponents.Label {
                    text: "CPU:"
                    font.bold: true
                }
                PlasmaComponents.Label {
                    text: `${root.cpuUsage}%`
                }
            }

            // Quick inference
            PlasmaComponents.TextField {
                id: quickQuery
                Layout.fillWidth: true
                placeholderText: "Ask Haven LLM..."
                enabled: root.serverOnline

                onAccepted: {
                    if (text.trim()) {
                        runInference(text.trim())
                    }
                }
            }

            // Action buttons
            RowLayout {
                spacing: 8

                PlasmaComponents.Button {
                    text: "Open Haven"
                    onClicked: Qt.openUrlExternally(root.serverUrl)
                }

                Item { Layout.fillWidth: true }

                PlasmaComponents.Button {
                    text: "Settings"
                    onClicked: plasmoid.configurationDialogOpened()
                }
            }

            // Response area
            PlasmaComponents.TextArea {
                id: responseArea
                Layout.fillWidth: true
                Layout.fillHeight: true
                readOnly: true
                placeholderText: "Response will appear here..."
                visible: text.length > 0
            }
        }
    }

    // ── Functions ───────────────────────────────────────────────

    function refreshStatus() {
        // Query Haven server
        var xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function() {
            if (xhr.readyState === XMLHttpRequest.DONE) {
                if (xhr.status === 200) {
                    var data = JSON.parse(xhr.responseText);
                    root.serverOnline = true;
                } else {
                    root.serverOnline = false;
                }
            }
        };
        xhr.open("GET", root.serverUrl + "/health");
        xhr.send();

        // Get stats
        var xhr2 = new XMLHttpRequest();
        xhr2.onreadystatechange = function() {
            if (xhr2.readyState === XMLHttpRequest.DONE) {
                if (xhr2.status === 200) {
                    var data = JSON.parse(xhr2.responseText);
                    root.tokensPerSecond = data.inference?.tokens_per_second || 0;
                    root.cpuUsage = data.cpu_percent || 0;
                }
            }
        };
        xhr2.open("GET", root.serverUrl + "/api/stats");
        xhr2.send();
    }

    function runInference(query) {
        responseArea.text = "Thinking...";

        var xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function() {
            if (xhr.readyState === XMLHttpRequest.DONE) {
                if (xhr.status === 200) {
                    var data = JSON.parse(xhr.responseText);
                    responseArea.text = data.choices[0]?.message?.content || "No response";
                } else {
                    responseArea.text = "Error: " + xhr.statusText;
                }
            }
        };
        xhr.open("POST", root.serverUrl + "/v1/chat/completions");
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.send(JSON.stringify({
            messages: [{ role: "user", content: query }],
            max_tokens: 256
        }));
    }

    // Auto-refresh every 5 seconds
    Timer {
        interval: 5000
        running: true
        repeat: true
        onTriggered: refreshStatus()
    }

    // Initial refresh
    Component.onCompleted: refreshStatus()
}
