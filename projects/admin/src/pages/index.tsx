import { serviceSideProps } from '@fastgpt/web/common/system/nextjs';
import React, { useEffect } from 'react';
import Loading from '@fastgpt/web/components/common/MyLoading';
import { useRouter } from 'next/router';

const index = () => {
  /**
  const router = useRouter();
  useEffect(() => {
    router.push('/user/list');
  }, [router]);
  return <Loading></Loading>;
   **/
  return;
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content))
    }
  };
}
export default index;
