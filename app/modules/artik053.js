const _ = require('lodash');
const BaseModule = require('./baseModule');

class artik053 extends BaseModule {
    constructor() {
        super();
        this.counter = 0;
        this.commandResponseSize = 8;
        this.wholeResponseSize = 0x32;
        this.isSendInitData = false;
        this.isSensorCheck = false;
        this.isConnect = false;

        this.sp = null;
        this.sensors = [];
        this.CHECK_PORT_MAP = {};
        this.SENSOR_COUNTER_LIST = {};
        this.returnData = {};
        this.motorMovementTypes = {
            Degrees: 0,
            Power: 1,
        };
        this.deviceTypes = {
            NxtTouch: 1,
            NxtLight: 2,
            NxtSound: 3,
            NxtColor: 4,
            NxtUltrasonic: 5,
            NxtTemperature: 6,
            LMotor: 7,
            MMotor: 8,
            Touch: 0x0e,
            Color: 0x1d,
            Ultrasonic: 0x1e,
            Gyroscope: 0x20,
            Infrared: 0x21,
            Initializing: 0x7d,
            Empty: 0x7e, // 126
            WrongPort: 0x7f,
            Unknown: 0xff,
        };
        this.outputPort = {
            A: 1,
            B: 2,
            C: 4,
            D: 8,
            ALL: 0x0f,
        };
        this.PORT_MAP = {
            A: {
                type: this.motorMovementTypes.Power,
                power: 0,
            },
            B: {
                type: this.motorMovementTypes.Power,
                power: 0,
            },
            C: {
                type: this.motorMovementTypes.Power,
                power: 0,
            },
            D: {
                type: this.motorMovementTypes.Power,
                power: 0,
            },
        };
        this.BUTTON_MAP = {
            UP: {
                key: 1,
            },
            DOWN: {
                key: 3,
            },
            LEFT: {
                key: 5,
            },
            RIGHT: {
                key: 4,
            },
            BACK: {
                key: 6,
            },
            ENTER: {
                key: 2,
            },
        };
        this.STATUS_COLOR_MAP = {
            OFF: {
                key: 0,
            },
            GREEN: {
                key: 1,
            },
            RED: {
                key: 2,
            },
            ORANGE: {
                key: 3,
            },
            GREEN_FLASH: {
                key: 4,
            },
            RED_FLASH: {
                key: 5,
            },
            ORANGE_FLASH: {
                key: 6,
            },
            GREEN_PULSE: {
                key: 7,
            },
            RED_PULSE: {
                key: 8,
            },
            ORANGE_PULSE: {
                key: 9,
            },
        };
        this.CURRENT_STATUS_COLOR = {
            COLOR: this.STATUS_COLOR_MAP.GREEN,
            APPLIED: true,
        };
        this.SENSOR_MAP = {
            '1': {
                type: this.deviceTypes.Touch,
                mode: 0,
            },
            '2': {
                type: this.deviceTypes.Touch,
                mode: 0,
            },
            '3': {
                type: this.deviceTypes.Touch,
                mode: 0,
            },
            '4': {
                type: this.deviceTypes.Touch,
                mode: 0,
            },
        };
        this.isSensing = false;
        this.LAST_PORT_MAP = null;
    }

    /**
     * Direct Send Command �� �� �κ��� �����Ѵ�.
     *
     * @returns {Buffer} size(2byte) + counter(2byte) + mode(1byte) + header(2byte)
     * @param replyModeByte 0x00(reply required), 0x80(no reply)
     * @param allocHeaderByte �Ҵ�� ����� byte ���� ��Ÿ����. �� ���� 4�� ���, 4byte �� result value �� ����Ѵ�.
     */
    makeInitBuffer(replyModeByte, allocHeaderByte) {
        const size = new Buffer([0xff, 0xff]); // dummy �� ������. #checkByteSize ���� ���ŵȴ�.
        const counter = this.getCounter();
        const reply = new Buffer(replyModeByte);
        const header = new Buffer(allocHeaderByte);
        return Buffer.concat([size, counter, reply, header]);
    }

    /**
     * ī���͸� �����´�. ī���� ���� request & response �� �����Ͽ�, ���� üũ�� ���� ���ȴ�.
     * �� ���� 2^15 �̻��� ��� 0���� �ʱ�ȭ�Ѵ�.
     * @returns {Buffer} little endian 2byte
     */
    getCounter() {
        let counterBuf = new Buffer(2);
        counterBuf.writeInt16LE(this.counter);
        if (this.counter >= 32767) {
            this.counter = 0;
        }
        this.counter++;
        return counterBuf;
    }

    /**
     * size �� �ش��ϴ� 2byte �� ������ ���� size �� �����.
     *
     * TODO �׷��ٸ� makeInitBuffer�� size�� ������ �ƹ��ϵ� ���� �ʴ´�.
     * @param buffer �Ķ���Ͱ� �ϼ��� buffer
     */
    checkByteSize(buffer) {
        const bufferLength = buffer.length - 2;
        buffer[0] = bufferLength;
        buffer[1] = bufferLength >> 8; // buffer length �� 2^8 �� �Ѵ� ���ϰ��, ���� ���� ���� size byte �� �����.
    }

    /**
     * ������ 200ms �������� üũ�Ѵ�. �����߿��� üũ���� �ʴ´�.
     */
    sensorChecking() {
        if (!this.isSensorCheck) {
            this.sensing = setInterval(() => {
                this.sensorCheck();
                this.isSensing = false;
            }, 200);
            this.isSensorCheck = true;
        }
    }

    init(handler, config) { }

    lostController() { }

    eventController(state) {
        if (state === 'connected') {
            clearInterval(this.sensing);
        }
    }

    setSerialPort(sp) {
        this.sp = sp;
    }

    /**
     * ���͸� �����ϰ�, output ������ üũ�Ѵ�.
     * @param sp serial port
     * @returns {null} ���� serial port �� ByteArray �� �ۼ��Ѵ�.
     */
    requestInitialData(sp) {
        this.isConnect = true;
        if (!this.sp) {
            this.sp = sp;
        }

        if (!this.isSendInitData) {
            const initBuf = this.makeInitBuffer([0x80], [0, 0]);
            const motorStop = new Buffer([0xa3, 0x81, 0, 0x81, 0x0f, 0x81, 0]);
            const initMotor = Buffer.concat([initBuf, motorStop]);
            this.checkByteSize(initMotor);
            sp.write(initMotor, () => {
                this.sensorChecking();
            });
        }
        return null;
    }

    checkInitialData(data, config) {
        return true;
    }

    handleLocalData(data) {
        // data: Native Buffer
        if (data[0] === this.wholeResponseSize + 3 && data[1] === 0) {
            const countKey = data.readInt16LE(2);
            if (countKey in this.SENSOR_COUNTER_LIST) {
                this.isSensing = false;
                delete this.SENSOR_COUNTER_LIST[countKey];
                data = data.slice(5); // ���� 4 byte �� size, counter �� �ش��Ѵ�. �� ���� �Ҵ� �� �����Ѵ�.
                let index = 0;

                Object.keys(this.SENSOR_MAP).forEach((p) => {
                    const port = Number(p) - 1;
                    index = port * this.commandResponseSize;

                    const type = data[index];
                    const mode = data[index + 1];
                    let siValue = Number(
                        (data.readFloatLE(index + 2) || 0).toFixed(1)
                    );
                    this.returnData[p] = {
                        type: type,
                        mode: mode,
                        siValue: siValue,
                    };
                });

                index = 4 * this.commandResponseSize;
                Object.keys(this.BUTTON_MAP).forEach((button) => {
                    if (data[index] === 1) {
                        console.log(button + ' button is pressed');
                    }

                    this.returnData[button] = {
                        pressed: data[index++] === 1,
                    };
                });
            }
        }
    }

    // Web Socket(��Ʈ��)�� ������ ������
    requestRemoteData(handler) {
        Object.keys(this.returnData).forEach((key) => {
            if (this.returnData[key] !== undefined) {
                handler.write(key, this.returnData[key]);
            }
        });
    }

    // Web Socket ������ ó��
    handleRemoteData(handler) {
        Object.keys(this.PORT_MAP).forEach((port) => {
            this.PORT_MAP[port] = handler.read(port);
        });
        Object.keys(this.SENSOR_MAP).forEach((port) => {
            this.SENSOR_MAP[port] = handler.read(port);
        });

        const receivedStatusColor = this.STATUS_COLOR_MAP[
            handler.read('STATUS_COLOR')
        ];
        if (
            receivedStatusColor !== undefined &&
            this.CURRENT_STATUS_COLOR.COLOR !== receivedStatusColor
        ) {
            this.CURRENT_STATUS_COLOR = {
                COLOR: receivedStatusColor,
                APPLIED: false,
            };
        }
    }

    // �ϵ��� ������ ������
    requestLocalData() {
        let isSendData = false;
        const initBuf = this.makeInitBuffer([0x80], [0, 0]);
        let sendBody;
        this.sensorCheck();
        let skipPortOutput = false;

        //���� ��Ʈ������� ���Ѻκ��� �ִ��� Ȯ��
        if (this.LAST_PORT_MAP) {
            const arr = Object.keys(this.PORT_MAP).filter((port) => {
                const map1 = this.PORT_MAP[port];
                const map2 = this.LAST_PORT_MAP[port];
                return !(map1.type === map2.type && map1.power === map2.power);
            });
            skipPortOutput = arr.length === 0;
        }

        //���Ѻκ��� �ִٸ� ��Ʈ�� ���� �����͸� ����
        if (!skipPortOutput) {
            isSendData = true;
            this.LAST_PORT_MAP = _.cloneDeep(this.PORT_MAP);
            sendBody = this.makePortCommandBuffer(isSendData);
        }

        //���� LED �÷� ���� ��û�� �ִ� ��� ���� Ŀ�ǵ带 ���̷ε忡 �߰�
        if (this.CURRENT_STATUS_COLOR.APPLIED === false) {
            isSendData = true;
            const statusLedCommand = this.makeStatusColorCommandBuffer(
                sendBody
            );

            if (!sendBody) {
                sendBody = statusLedCommand;
            } else {
                sendBody = Buffer.concat([sendBody, statusLedCommand]);
            }
        }

        if (isSendData && sendBody) {
            const totalLength = initBuf.length + sendBody.length;
            const sendBuffer = Buffer.concat([initBuf, sendBody], totalLength);
            this.checkByteSize(sendBuffer);
            return sendBuffer;
        }

        return null;
    }

    makeStatusColorCommandBuffer() {
        this.CURRENT_STATUS_COLOR.APPLIED = true;
        const statusLedCommand = new Buffer([
            0x82,
            0x1b,
            this.CURRENT_STATUS_COLOR.COLOR.key,
        ]);

        return new Buffer(statusLedCommand);
    }
    /*
    makePortCommandBuffer() {
        let sendBody = null;
        Object.keys(this.PORT_MAP).forEach((port) => {
            let backBuffer;
            let frontBuffer;
            const portMap = this.PORT_MAP[port];
            let brake = 0;
            let checkPortMap = this.CHECK_PORT_MAP[port];
            if (!checkPortMap || portMap.id !== checkPortMap.id) {
                let portOut;
                let power = Number(portMap.power);
                if (portMap.type === this.motorMovementTypes.Power) {
                    const time = Number(portMap.time) || 0;
                    brake = 0;
                    if (power > 100) {
                        power = 100;
                    } else if (power < -100) {
                        power = -100;
                    } else if (power === 0) {
                        brake = 1;
                    }

                    if (time <= 0) {
                        // infinity output port mode
                        portOut = new Buffer([
                            0xa4,
                            0x81,
                            0,
                            0x81,
                            this.outputPort[port],
                            0x81,
                            power,
                            0xa6,
                            0x81,
                            0,
                            0x81,
                            this.outputPort[port],
                        ]);
                    } else {
                        // time set mode 232, 3 === 1000ms
                        frontBuffer = new Buffer([
                            0xad,
                            0x81,
                            0,
                            0x81,
                            this.outputPort[port],
                            0x81,
                            power,
                            0x83,
                            0,
                            0,
                            0,
                            0,
                            0x83,
                        ]);
                        backBuffer = new Buffer([
                            0x83,
                            0,
                            0,
                            0,
                            0,
                            0x81,
                            brake,
                        ]);
                        const timeBuffer = new Buffer(4);
                        timeBuffer.writeInt32LE(time);
                        portOut = Buffer.concat([
                            frontBuffer,
                            timeBuffer,
                            backBuffer,
                        ]);
                    }
                } else {
                    const degree = Number(portMap.degree) || 0;
                    frontBuffer = new Buffer([
                        0xac,
                        0x81,
                        0,
                        0x81,
                        this.outputPort[port],
                        0x81,
                        power,
                        0x83,
                        0,
                        0,
                        0,
                        0,
                        0x83,
                    ]);
                    backBuffer = new Buffer([0x83, 0, 0, 0, 0, 0x81, brake]);
                    const degreeBuffer = new Buffer(4);
                    degreeBuffer.writeInt32LE(degree);
                    portOut = Buffer.concat([
                        frontBuffer,
                        degreeBuffer,
                        backBuffer,
                    ]);
                }

                if (portOut) {
                    if (!sendBody) {
                        sendBody = new Buffer(portOut);
                    } else {
                        sendBody = Buffer.concat([sendBody, portOut]);
                    }
                }

                this.CHECK_PORT_MAP[port] = this.PORT_MAP[port];
            }
        });
        return sendBody;
    }*/

    /**
     * requestInitialData(external interval) -> sensorChecking(interval) -> sensorCheck
     * ���������͸� ������ �ѹ��� ������.
     * output �� �����ϴ� Port 1,2,3,4 ���� üũ�Ѵ�.
     *
     * ������ �����ʹ� �������� ������ ����̰� �޴� ��� ���� �������� ������̴�.
     */
    /*
    sensorCheck() {
        if (!this.isSensing) {
            this.isSensing = true;
            const initBuf = this.makeInitBuffer(
                [0],
                [this.wholeResponseSize, 0]
            );
            const counter = initBuf.readInt16LE(2); // initBuf�� index(2) ���� 2byte �� counter �� �ش�
            this.SENSOR_COUNTER_LIST[counter] = true;
            let sensorBody = [];
            let index = 0;
            Object.keys(this.SENSOR_MAP).forEach((p) => {
                let mode = 0;
                if (this.returnData[p] && this.returnData[p]['type']) {
                    mode = this.SENSOR_MAP[p]['mode'] || 0;
                }
                const port = Number(p) - 1;
                index = port * this.commandResponseSize;
                const modeSet = new Buffer([
                    0x99,
                    0x05,
                    0,
                    port,
                    0xe1,
                    index,
                    0xe1,
                    index + 1,
                ]);
                const readySi = new Buffer([
                    0x99,
                    0x1d,
                    0,
                    port,
                    0,
                    mode,
                    1,
                    0xe1,
                    index + 2,
                ]);

                if (!sensorBody.length) {
                    sensorBody = Buffer.concat([modeSet, readySi]);
                } else {
                    sensorBody = Buffer.concat([sensorBody, modeSet, readySi]);
                }
            });
            /*
			�����丵 ���� isButtonPressed ����
			sensorBody
			* */
            let offsetAfterPortResponse = 4 * this.commandResponseSize; // ��Ʈ�� [0~3] ������.
            Object.keys(this.BUTTON_MAP).forEach((button) => {
                const buttonPressedCommand = new Buffer([
                    0x83, // opUI_BUTTON
                    0x09, // pressed
                    this.BUTTON_MAP[button].key,
                    0xe1,
                    offsetAfterPortResponse++,
                ]);

                sensorBody = Buffer.concat([sensorBody, buttonPressedCommand]);
            });

            /*
            �����丵 ���� isButtonPressed ����
             */
            const totalLength = initBuf.length + sensorBody.length;
            const sendBuffer = Buffer.concat(
                [initBuf, sensorBody],
                totalLength
            );
            this.checkByteSize(sendBuffer);
            this.sp.write(sendBuffer);
        }
    }*/

    connect() { }

    disconnect(connect) {
        if (this.isConnect) {
            clearInterval(this.sensing);
            this.counter = 0;
            this.commandResponseSize = 11;
            this.isSendInitData = false;
            this.isSensorCheck = false;
            this.isConnect = false;
            this.CURRENT_STATUS_COLOR = {
                COLOR: this.STATUS_COLOR_MAP['GREEN'],
                APPLIED: false,
            };

            /*
            send disconnect command
            no reply, OpProgram_Stop(programID=01)
            */
            if (this.sp) {
                this.sp.write(
                    new Buffer('08005500800000821B01', 'hex'),
                    (err) => {
                        /* nothing to do. disconnect command execute */
                    }
                );
                this.sp.write(
                    new Buffer('070055008000000201', 'hex'),
                    (err) => {
                        this.sp = null;
                        if (err) {
                            console.log(err);
                        }
                        connect.close();
                    }
                );
            } else {
                connect.close();
            }
        }
    }

    reset() { }
}

module.exports = new artik053();
