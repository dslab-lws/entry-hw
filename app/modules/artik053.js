const _ = require('lodash');
const BaseModule = require('./baseModule');

class artik053 extends BaseModule {
    constructor() {
        super();
        this.digitalValue = new Array(14);
        this.analogValue = new Array(6);
        this.remoteDigitalValue = new Array(14);
        this.readablePorts = null;
        this.remainValue = null;
        this.counter = 0;
        this.commandResponseSize = 8;
        this.wholeResponseSize = 0x32;
        this.isSendInitData = false;
        this.isSensorCheck = false;
        this.isConnect = false;

        this.sp = null;

    }


    init(handler, config) { }


    setSerialPort(sp) {
        this.sp = sp;
    }

    requestInitialData(sp) {
        this.isConnect = true;
        if (!this.sp) {
            this.sp = sp;
        }
        return null;
    }

    checkInitialData(data, config) {
        return true;
    }

    handleLocalData(data) {
        var pointer = 0;
        for (var i = 0; i < 32; i++) {
            var chunk;
            if (!this.remainValue) {
                chunk = data[i];
            } else {
                chunk = this.remainValue;
                i--;
            }
            if (chunk >> 7) {
                if ((chunk >> 6) & 1) {
                    var nextChunk = data[i + 1];
                    if (!nextChunk && nextChunk !== 0) {
                        this.remainValue = chunk;
                    } else {
                        this.remainValue = null;

                        var port = (chunk >> 3) & 7;
                        this.analogValue[port] =
                            ((chunk & 7) << 7) + (nextChunk & 127);
                    }
                    i++;
                } else {
                    var port = (chunk >> 2) & 15;
                    this.digitalValue[port] = chunk & 1;
                }
            }
        }
    }

    // Web Socket(엔트리)에 전달할 데이터
    requestRemoteData(handler) {
        for (var i = 0; i < this.analogValue.length; i++) {
            var value = this.analogValue[i];
            handler.write('a' + i, value);
        }
        for (var i = 0; i < this.digitalValue.length; i++) {
            var value = this.digitalValue[i];
            handler.write(i, value);
        }
    }

    // Web Socket 데이터 처리
    handleRemoteData(handler) {
        this.readablePorts = handler.read('readablePorts');
        var digitalValue = this.remoteDigitalValue;
        for (var port = 0; port < 14; port++) {
            digitalValue[port] = handler.read(port);
        }
    }

    // 하드웨어에 전달할 데이터
    requestLocalData() {
        var queryString = [];

        var readablePorts = this.readablePorts;
        if (readablePorts) {
            for (var i in readablePorts) {
                var query = (5 << 5) + (readablePorts[i] << 1);
                queryString.push(query);
            }
        }
        var readablePortsValues =
            (readablePorts && Object.values(readablePorts)) || [];
        var digitalValue = this.remoteDigitalValue;
        for (var port = 0; port < 14; port++) {
            if (readablePortsValues.indexOf(port) > -1) {
                continue;
            }
            var value = digitalValue[port];
            if (value === 255 || value === 0) {
                var query = (7 << 5) + (port << 1) + (value == 255 ? 1 : 0);
                queryString.push(query);
            } else if (value > 0 && value < 255) {
                var query = (6 << 5) + (port << 1) + (value >> 7);
                queryString.push(query);
                query = value & 127;
                queryString.push(query);
            }
        }
        return queryString;
    }

    connect() { }

    reset() { }
}

module.exports = new artik053();
