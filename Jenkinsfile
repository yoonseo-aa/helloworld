// develop 브랜치에 push 되면 EC2 호스트에 SSH로 접속해
// git pull + docker compose 재배포를 실행하는 파이프라인.
//
// 사전 준비 (Jenkins 관리 화면에서):
//   1. Credentials 에 'ec2-deploy-key' 라는 ID로 SSH Username with private key 등록
//      (Username: ubuntu, Private key: 아래 안내대로 발급한 배포 전용 키)
//   2. 이 Jenkinsfile 을 사용하는 Pipeline job 을 만들고 GitLab repo(develop)를 SCM 으로 연결
//   3. Mattermost 알림용: Credentials 에 'mattermost-webhook' 라는 ID로 Secret text 등록
//      (Mattermost 팀 설정 > 통합 > 수신 웹훅 에서 발급한 URL을 그대로 값으로 넣기)

// Mattermost 알림 전송
def sendMMNotify(boolean success, Map info) {
    def titleLine = success ? "## :jenkins7: 배포 성공 ✅" : "## :angry_jenkins: 배포 실패 ❌"
    def lines = []
    if (info.mention) lines << "**작성자**: ${info.mention}"
    if (info.branch) lines << "**대상 브랜치**: `${info.branch}`"
    if (info.commit?.msg) {
        def commitLine = info.commit?.url ? "[${info.commit.msg}](${info.commit.url})" : info.commit.msg
        lines << "**커밋**: ${commitLine}"
    }
    if (info.buildUrl) {
        lines << "**빌드 상세**: [Details](${info.buildUrl})"
    }
    if (!success && info.details) {
        lines << "**에러 로그**:\n${info.details}"
    }

    def text = "${titleLine}\n" + (lines ? ("\n" + lines.join("\n")) : "")

    // 안전 전송(크리덴셜 경고 없음)
    writeFile file: 'payload.json', text: groovy.json.JsonOutput.toJson([
        text      : text,
        username  : "Jenkins",
        icon_emoji: ":jenkins7:"
    ])

    withCredentials([string(credentialsId: 'mattermost-webhook', variable: 'MM_WEBHOOK')]) {
        sh(script: '''
            curl -sS -f -X POST -H 'Content-Type: application/json' \
                --data-binary @payload.json \
                "$MM_WEBHOOK" || true
        ''')
    }
}

pipeline {
    agent any

    options {
        gitLabConnection('gitlab')
    }

    triggers {
        // GitLab webhook 이 안 붙는 환경이면 이 트리거는 무시되고
        // Jenkins job 설정에서 Poll SCM (예: H/5 * * * *) 로 대체 가능
        gitlab(triggerOnPush: true, triggerOnMergeRequest: false,
               branchFilterType: 'NameBasedFilter', includeBranchesSpec: 'develop')
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Deploy to EC2') {
            steps {
                withCredentials([sshUserPrivateKey(credentialsId: 'ec2-deploy-key', keyFileVariable: 'SSH_KEY', usernameVariable: 'SSH_USER')]) {
                    sh '''
                        ssh -o StrictHostKeyChecking=no -i "$SSH_KEY" "$SSH_USER"@localhost '
                            cd ~/S15P11E204-deploy &&
                            git fetch origin develop &&
                            git reset --hard origin/develop &&
                            docker compose up -d --build
                        '
                    '''
                }
            }
        }
    }

    post {
        success {
            echo '배포 성공'
            script {
                sendMMNotify(true, [
                    branch  : 'develop',
                    buildUrl: env.BUILD_URL
                ])
            }
        }
        failure {
            echo '배포 실패 - 콘솔 로그 확인'
            script {
                sendMMNotify(false, [
                    branch  : 'develop',
                    buildUrl: env.BUILD_URL
                ])
            }
        }
    }
}
