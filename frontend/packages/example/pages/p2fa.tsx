import type {ApiPromise} from '@polkadot/api'
import {ContractPromise} from '@polkadot/api-contract'
import {Key, useEffect, useRef, useState} from 'react'
import {signCertificate, CertificateData} from '@phala/sdk'
import {Button} from 'baseui/button'
import {ButtonGroup} from 'baseui/button-group'
import {toaster} from 'baseui/toast'
import {useAtom} from 'jotai'
import accountAtom from '../atoms/account'
import {getSigner} from '../lib/polkadotExtension'
import ContractLoader from '../components/ContractLoader'
import QRCode from "react-qr-code";
import useInterval from "../hooks/useInterval";
import {HeadingMedium, HeadingSmall} from "baseui/typography";
import { PinCode } from "baseui/pin-code";
import {useStyletron} from 'baseui';

const P2FA: Page = () => {
  const [account] = useAtom(accountAtom)
  const [certificateData, setCertificateData] = useState<CertificateData>()
  const [api, setApi] = useState<ApiPromise>()
  const [contract, setContract] = useState<ContractPromise>()

  const [initialized, setInitialized] = useState(false)
  const [bindingURL, setBindingURL] = useState<string>("")
  const bindingURLToastKey = useRef<Key>()

  const [p2faBindToken, setP2faBindToken] = useState(Array(6).fill(''));
  const buttonBindRef = useRef(null);

  const [p2faVerifyToken, setP2faVerifyToken] = useState(Array(6).fill(''));
  const buttonVerifyRef = useRef(null);

  const [css] = useStyletron();

  useEffect(
    () => () => {
      api?.disconnect()
    },
    [api]
  )

  useEffect(() => {
    setCertificateData(undefined)
  }, [account])

  const getBindingURL = async () => {
    if (!certificateData || !contract) return

    if (!bindingURLToastKey.current) {
      bindingURLToastKey.current = toaster.info(
        'Requesting binding URL...',
        {
          autoHideDuration: 0,
        }
      )
    }

    const {output} = await contract.query.get2faUrl(certificateData as any, {})
    const url = output?.toString()

    if (url) {
      toaster.clear(bindingURLToastKey.current)
        setBindingURL(url)
    }
  }

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
            setInitialized(true);
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
    const {output} = await contract.query.verifyToken(certificateData as any, {})
    console.log(output?.toHuman())
    toaster.info(JSON.stringify(output?.toHuman()), {})
  }

  return certificateData ? (
      account ? (
          <>
              <HeadingMedium as="h1">1. Initialize 2FA</HeadingMedium>
              <Button disabled={!certificateData} onClick={onInit}>
                  Initialize 2FA
              </Button>
              { bindingURL && (
                  <>
                      <HeadingSmall as="h1">Scan QR code using your authenticator</HeadingSmall>
                      <QRCode value={bindingURL} />
                  </>
              )}
              <HeadingMedium as="h1">2. Bind 2FA</HeadingMedium>
              <div className={css({display: 'flex'})}>
                  <PinCode
                      values={p2faBindToken}
                      onChange={({values}) => {
                          setP2faBindToken(values);
                          // if all of our inputs are filled in,
                          // shift focus to our submit button
                          if (!values.includes('')) {
                              // @ts-ignore
                              buttonBindRef.current && buttonBindRef.current.focus();
                          }
                      }}
                  />
                  <Button ref={buttonBindRef} disabled={!certificateData} onClick={onBind}>Bind</Button>
              </div>
              <HeadingMedium as="h1">3. Verify 2FA Token Anytime</HeadingMedium>
              <div className={css({display: 'flex'})}>
                  <PinCode
                      values={p2faVerifyToken}
                      onChange={({values}) => {
                          setP2faVerifyToken(values);
                          // if all of our inputs are filled in,
                          // shift focus to our submit button
                          if (!values.includes('')) {
                              // @ts-ignore
                              buttonVerifyRef.current && buttonVerifyRef.current.focus();
                          }
                      }}
                  />
                  <Button ref={buttonVerifyRef} disabled={!certificateData} onClick={onVerify}>Verify</Button>
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
  )
}

P2FA.title = 'Phala 2FA'

export default P2FA
