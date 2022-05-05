import type {ApiPromise} from '@polkadot/api'
import {ContractPromise} from '@polkadot/api-contract'
import {Key, useEffect, useRef, useState} from 'react'
import {signCertificate, CertificateData} from '@phala/sdk'
import {Button} from 'baseui/button'
import {toaster} from 'baseui/toast'
import {useAtom} from 'jotai'
import accountAtom from '../atoms/account'
import {getSigner} from '../lib/polkadotExtension'
import ContractLoader from '../components/ContractLoader'
import QRCode from 'react-qr-code'
import useInterval from '../hooks/useInterval'
import {HeadingMedium, HeadingSmall, ParagraphMedium} from 'baseui/typography'
import {PinCode} from 'baseui/pin-code'
import {useStyletron} from 'baseui'

const P2FA: Page = () => {
  const [account] = useAtom(accountAtom)
  const [certificateData, setCertificateData] = useState<CertificateData>()
  const [api, setApi] = useState<ApiPromise>()
  const [contract, setContract] = useState<ContractPromise>()

  const [enabled2fa, setEnabled2fa] = useState('false')

  const [initialized, setInitialized] = useState(false)
  const [bindingURL, setBindingURL] = useState<string>('')
  const bindingURLToastKey = useRef<Key>()

  const [p2faBindToken, setP2faBindToken] = useState(Array(6).fill(''))
  const buttonBindRef = useRef(null)

  const [p2faVerifyToken, setP2faVerifyToken] = useState(Array(6).fill(''))
  const buttonVerifyRef = useRef(null)

  const [css] = useStyletron()

  useEffect(
    () => () => {
      api?.disconnect()
    },
    [api]
  )

  useEffect(() => {
    setCertificateData(undefined)
  }, [account])

  const get2faStatus = async () => {
    if (!certificateData || !contract) return

    const {output} = await contract.query.enabled2fa(certificateData as any, {})
    const enabled = output?.toString()

    if (enabled) {
      setEnabled2fa(enabled)
      if (enabled === 'true') {
        setInitialized(true)
      }
    }
  }

  const getBindingURL = async () => {
    if (!certificateData || !contract) return

    if (!bindingURLToastKey.current) {
      bindingURLToastKey.current = toaster.info('Requesting binding URL...', {
        autoHideDuration: 0,
      })
    }

    const {output} = await contract.query.get2faUrl(certificateData as any, {})
    const url = output?.toString()

    if (url) {
      toaster.clear(bindingURLToastKey.current)
      setBindingURL(url)
    }
  }

  useInterval(() => {
    get2faStatus()
  }, 3000)

  useInterval(
    () => {
      getBindingURL()
    },
    initialized && !bindingURL ? 2000 : null
  )

  const onSignCertificate = async () => {
    if (account && api) {
      try {
        const signer = await getSigner(account)
        // Save certificate data to state, or anywhere else you want like local storage
        setCertificateData(
          await signCertificate({
            api,
            account,
            signer,
          })
        )
        toaster.positive('Certificate signed', {})
      } catch (err) {
        toaster.negative((err as Error).message, {})
      }
    }
  }

  const onInit = async () => {
    if (!certificateData || !contract || !account) return
    try {
      // Send the command
      const signer = await getSigner(account)
      await contract.tx
        .init2fa({})
        .signAndSend(account.address, {signer}, (status) => {
          if (status.isFinalized) {
            toaster.positive('Transaction is finalized', {})
            setInitialized(true)
          }
        })
    } catch (err) {
      toaster.negative((err as Error).message, {})
    }
  }

  const onBind = async () => {
    if (!certificateData || !contract || !account) return
    try {
      // Send the command
      const signer = await getSigner(account)
      await contract.tx
        .verifyBind({}, p2faBindToken.join(''))
        .signAndSend(account.address, {signer}, (status) => {
          if (status.isFinalized) {
            toaster.positive('Transaction is finalized', {})
          }
        })
    } catch (err) {
      toaster.negative((err as Error).message, {})
    }
  }

  const onVerify = async () => {
    if (!certificateData || !contract) return
    const {output} = await contract.query.verifyToken(
      certificateData as any,
      {},
      p2faVerifyToken.join('')
    )
    toaster.info(JSON.stringify(output?.toHuman()), {})
  }

  return (
    <>
      <ParagraphMedium>
        This application achieves two-factor authentication on chain, without
        leaking any sensitive data. Specifically, secrets for 2FA are all
        generated on-chain with Phala Fat Contract, which ensures
        confidentiality and integrity.
      </ParagraphMedium>
      <ParagraphMedium>
        This application is possible to serve as{' '}
        <strong>a second layer for wallet protections</strong>. Nowadays, the
        loss of private keys or mnemonic phrases generally predicts the loss of
        wallets. However, if one enables 2FA on chain, even the private keys are
        lost, funds can be still safe.
      </ParagraphMedium>
      {contract ? (
        certificateData ? (
          <>
            <ParagraphMedium>
              <strong>2FA enabled for your account: {enabled2fa}</strong>
            </ParagraphMedium>
            <HeadingMedium as="h1">1. Initialize 2FA</HeadingMedium>
            <ParagraphMedium>
              Before using 2FA to protect your on-chain data, you firstly need
              to initialize a secret key for your 2FA verification process.
              Thanks to Phala Fat Contract, the secret generating process can be
              achieved in the contract safely.
            </ParagraphMedium>
            <Button disabled={!certificateData} onClick={onInit}>
              {initialized
                ? 'Re-initialize 2FA (Reset Secret)'
                : 'Initialize 2FA'}
            </Button>
            {bindingURL && (
              <>
                <HeadingSmall as="h1">
                  Scan QR code using your authenticator
                </HeadingSmall>
                <QRCode value={bindingURL} />
                <ParagraphMedium>Binding URL: {bindingURL}</ParagraphMedium>
              </>
            )}
            <HeadingMedium as="h1">2. Bind 2FA</HeadingMedium>
            <ParagraphMedium>
              The 2FA will be enabled after successfully verifying the token.
              This would allow the contract to make sure the token generated by
              your authenticator works well with it.
            </ParagraphMedium>
            <div className={css({display: 'flex'})}>
              <PinCode
                values={p2faBindToken}
                onChange={({values}) => {
                  setP2faBindToken(values)
                  // if all of our inputs are filled in,
                  // shift focus to our submit button
                  if (!values.includes('')) {
                    // @ts-ignore
                    buttonBindRef.current && buttonBindRef.current.focus()
                  }
                }}
              />
              <Button
                ref={buttonBindRef}
                disabled={!certificateData}
                onClick={onBind}
              >
                Bind
              </Button>
            </div>
            <HeadingMedium as="h1">3. Verify 2FA Token Anytime</HeadingMedium>
            <ParagraphMedium>
              Finally, after initializing and binding, your 2FA is successfully
              enabled. Now any third party application can use this 2FA to
              verify your identity. Try it yourself~
            </ParagraphMedium>
            <div className={css({display: 'flex'})}>
              <PinCode
                values={p2faVerifyToken}
                onChange={({values}) => {
                  setP2faVerifyToken(values)
                  // if all of our inputs are filled in,
                  // shift focus to our submit button
                  if (!values.includes('')) {
                    // @ts-ignore
                    buttonVerifyRef.current && buttonVerifyRef.current.focus()
                  }
                }}
              />
              <Button
                ref={buttonVerifyRef}
                disabled={!certificateData}
                onClick={onVerify}
              >
                Verify
              </Button>
            </div>
          </>
        ) : (
          <Button disabled={!account} onClick={onSignCertificate}>
            Sign Certificate
          </Button>
        )
      ) : (
        <ContractLoader
          name="P2FA"
          onLoad={({api, contract}) => {
            setApi(api)
            setContract(contract)
          }}
        />
      )}
    </>
  )
}

P2FA.title = 'Phala 2FA'

export default P2FA
